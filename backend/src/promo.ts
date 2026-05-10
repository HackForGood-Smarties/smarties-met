// Subsidy authorization codes — signed with Ed25519 by an authorised
// issuer (a polyclinic, hospital MSW, AIC Link officer, social-service
// agency). Anyone holding the issuer's public key can verify offline;
// no online round-trip is needed.
//
// Code wire format:  SMRT.<base64url(packed payload)>.<base64url(64-byte sig)>
//
// Compact binary payload (v1):
//   1  byte   version (1)
//   16 bytes  sub — sha256(NRIC) truncated to 128 bits
//   1  byte   tier — subsidy %
//   2  bytes  vf  — days since 2026-01-01 (BE u16)
//   2  bytes  vt  — days since 2026-01-01 (BE u16)
//   1  byte   iss_length
//   N  bytes  iss — issuer id (e.g. "AMK_POLY"), UTF-8

const AIC_PUB_KEY_B64 =
  "MCowBQYDK2VwAyEA9E1+rFGrgwvfacP0uh788J+z0b/Um3B3ewIu4hnBAhU=";
const AIC_PRIV_KEY_B64 =
  "MC4CAQAwBQYDK2VwBCIEICrpfRqnuGLAy7HhwzA/GDuiaHQyHBseSgBMpFX0kt2A";

const DAY_EPOCH_MS = Date.UTC(2026, 0, 1);

export interface PromoPayload {
  v: 1;
  iss: string;
  sub: string;   // 32 hex chars
  tier: number;  // 0..100
  vf: string;    // YYYY-MM-DD
  vt: string;    // YYYY-MM-DD
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
    // Issuer is the Medical Social Worker (MSW) acting under AIC's
    // delegated signing authority — the same role that certifies MET
    // need today via the paper referral pipeline.
    iss: req.iss ?? "MSW @ AMK Polyclinic",
    sub,
    tier: clampTier(req.tier),
    vf: today.toISOString().slice(0, 10),
    vt,
  };
  const packed = packPayload(payload);
  const privKey = await importPrivKey();
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", privKey, packed));
  return `SMRT.${b64url(packed)}.${b64url(sig)}`;
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
  let packed: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    packed = b64urlDecode(payloadB64!);
    sigBytes = b64urlDecode(sigB64!);
  } catch {
    return { ok: false, reason: "Code is corrupted" };
  }
  if (sigBytes.length !== 64) return { ok: false, reason: "Signature length invalid" };

  const pubKey = await importPubKey();
  const sigOk = await crypto.subtle.verify("Ed25519", pubKey, sigBytes, packed);
  if (!sigOk) return { ok: false, reason: "Signature not from a trusted issuer" };

  let payload: PromoPayload;
  try {
    payload = unpackPayload(packed);
  } catch (e) {
    return { ok: false, reason: "Code payload is malformed" };
  }
  if (payload.v !== 1) return { ok: false, reason: "Unknown code version" };

  const today = new Date().toISOString().slice(0, 10);
  if (payload.vf > today) return { ok: false, reason: `Code is not valid until ${payload.vf}` };
  if (payload.vt < today) return { ok: false, reason: `Code expired on ${payload.vt}` };

  return { ok: true, payload };
}

export function pubkeyB64(): string {
  return AIC_PUB_KEY_B64;
}

// ───────── packing ─────────

function packPayload(p: PromoPayload): Uint8Array {
  const issBytes = new TextEncoder().encode(p.iss);
  if (issBytes.length > 255) throw new Error("iss too long");
  if (p.sub.length !== 32) throw new Error("sub must be 32 hex chars");
  const subBytes = hexToBytes(p.sub);
  const vf = dateToDays(p.vf);
  const vt = dateToDays(p.vt);
  if (vf < 0 || vf > 0xffff) throw new Error("vf out of range");
  if (vt < 0 || vt > 0xffff) throw new Error("vt out of range");

  const out = new Uint8Array(23 + issBytes.length);
  let i = 0;
  out[i++] = p.v;
  out.set(subBytes, i); i += 16;
  out[i++] = clampTier(p.tier);
  out[i++] = (vf >> 8) & 0xff; out[i++] = vf & 0xff;
  out[i++] = (vt >> 8) & 0xff; out[i++] = vt & 0xff;
  out[i++] = issBytes.length;
  out.set(issBytes, i);
  return out;
}

function unpackPayload(bytes: Uint8Array): PromoPayload {
  if (bytes.length < 23) throw new Error("payload too short");
  let i = 0;
  const v = bytes[i++]!;
  const sub = bytesToHex(bytes.slice(i, i + 16)); i += 16;
  const tier = bytes[i++]!;
  const vf = (bytes[i++]! << 8) | bytes[i++]!;
  const vt = (bytes[i++]! << 8) | bytes[i++]!;
  const issLen = bytes[i++]!;
  if (i + issLen > bytes.length) throw new Error("iss truncated");
  const iss = new TextDecoder().decode(bytes.slice(i, i + issLen));
  return { v: v as 1, iss, sub, tier, vf: daysToDate(vf), vt: daysToDate(vt) };
}

function dateToDays(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return Math.floor((Date.UTC(y!, m! - 1, d!) - DAY_EPOCH_MS) / 86400000);
}
function daysToDate(days: number): string {
  const d = new Date(DAY_EPOCH_MS + days * 86400000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ───────── small helpers ─────────

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
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
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
