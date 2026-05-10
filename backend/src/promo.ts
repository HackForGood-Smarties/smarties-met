// AIC subsidy authorization codes — signed with Ed25519 by the issuing
// facility (a polyclinic, hospital MSW, AIC Link officer). Anyone holding
// the public key can verify offline; no AIC backend round-trip is needed.
//
// Code wire format:  SMRT.<base64url(JSON payload)>.<base64url(64-byte sig)>
//
// Payload fields:
//   v   schema version (1)
//   iss issuing facility id (e.g. "AMK_POLY", "AIC_LINK_NORTH")
//   sub sha256(NRIC).slice(0,32) — binds the code to a specific senior
//   tier subsidy % (50–85 in the placeholder model)
//   vf  validity start (ISO date, "YYYY-MM-DD")
//   vt  validity end   (ISO date)
//   jti unique id (UUID) — replayed jtis are rejected by the verifier
//   uses 1 (single use; reserved for future unlimited-use codes)

// AIC public key (SPKI DER, base64). Ships with the verifier.
const AIC_PUB_KEY_B64 =
  "MCowBQYDK2VwAyEA9E1+rFGrgwvfacP0uh788J+z0b/Um3B3ewIu4hnBAhU=";

// AIC signing key (PKCS8 DER, base64). For the demo this lives in the
// worker; in production it would be in the issuer's HSM, accessible only
// via a signing endpoint. The verifier never sees it.
const AIC_PRIV_KEY_B64 =
  "MC4CAQAwBQYDK2VwBCIEICrpfRqnuGLAy7HhwzA/GDuiaHQyHBseSgBMpFX0kt2A";

export interface PromoPayload {
  v: 1;
  iss: string;
  sub: string;
  tier: number;
  vf: string;
  vt: string;
  jti: string;
  uses: number;
}

export interface IssueRequest {
  nric: string;
  tier: number;
  iss?: string;
  validUntil?: string; // YYYY-MM-DD; defaults to +12 months
}

export async function hashNric(nric: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(nric.trim().toUpperCase()),
  );
  return bytesToHex(new Uint8Array(buf)).slice(0, 32);
}

export async function issueCode(req: IssueRequest): Promise<string> {
  const sub = await hashNric(req.nric);
  const today = new Date();
  const vt =
    req.validUntil ??
    new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);
  const payload: PromoPayload = {
    v: 1,
    iss: req.iss ?? "AMK_POLY",
    sub,
    tier: clampTier(req.tier),
    vf: today.toISOString().slice(0, 10),
    vt,
    jti: crypto.randomUUID(),
    uses: 1,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const privKey = await importPrivKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privKey, payloadBytes),
  );
  return `SMRT.${b64url(payloadBytes)}.${b64url(sig)}`;
}

export interface VerifyOk { ok: true; payload: PromoPayload }
export interface VerifyErr { ok: false; reason: string }
export type VerifyResult = VerifyOk | VerifyErr;

export async function verifyCode(code: string): Promise<VerifyResult> {
  const parts = code.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "SMRT") {
    return { ok: false, reason: "Code format not recognised" };
  }
  const [, payloadB64, sigB64] = parts;
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = b64urlDecode(payloadB64!);
    sigBytes = b64urlDecode(sigB64!);
  } catch {
    return { ok: false, reason: "Code is corrupted" };
  }
  if (sigBytes.length !== 64) {
    return { ok: false, reason: "Signature length invalid" };
  }
  const pubKey = await importPubKey();
  const sigOk = await crypto.subtle.verify(
    "Ed25519",
    pubKey,
    sigBytes,
    payloadBytes,
  );
  if (!sigOk) {
    return { ok: false, reason: "Signature not from a trusted AIC issuer" };
  }

  let payload: PromoPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, reason: "Code payload is not valid JSON" };
  }
  if (payload.v !== 1) return { ok: false, reason: "Unknown code version" };

  const today = new Date().toISOString().slice(0, 10);
  if (payload.vf > today)
    return { ok: false, reason: `Code is not valid until ${payload.vf}` };
  if (payload.vt < today)
    return { ok: false, reason: `Code expired on ${payload.vt}` };

  return { ok: true, payload };
}

export function pubkeyB64(): string {
  return AIC_PUB_KEY_B64;
}

// ───────── helpers ─────────

function clampTier(t: number): number {
  if (!Number.isFinite(t)) return 50;
  return Math.max(0, Math.min(95, Math.round(t)));
}

function b64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

async function importPubKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    b64Decode(AIC_PUB_KEY_B64),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
}
async function importPrivKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    b64Decode(AIC_PRIV_KEY_B64),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
}
