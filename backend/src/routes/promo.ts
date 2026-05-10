import { Hono } from "hono";
import { hashNric, issueCode, pubkeyB64, verifyCode } from "../promo";
import type { Env } from "../types";

export const promoRoutes = new Hono<{
  Bindings: Env;
  Variables: { caregiverId: string };
}>();

// Public — anyone can hold the AIC pubkey to verify codes offline.
promoRoutes.get("/pubkey", (c) =>
  c.json({ algorithm: "Ed25519", spki_b64: pubkeyB64() }),
);

// Demo helper: stands in for the AIC issuing service. In production this
// endpoint would be on AIC infrastructure and require strong staff auth.
promoRoutes.post("/issue", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    nric?: string;
    tier?: number;
    iss?: string;
    validUntil?: string;
  };
  if (!body.nric) return c.json({ error: "nric required" }, 400);
  if (typeof body.tier !== "number")
    return c.json({ error: "tier (subsidy %) required" }, 400);

  const code = await issueCode({
    nric: body.nric,
    tier: body.tier,
    iss: body.iss,
    validUntil: body.validUntil,
  });
  return c.json({ code });
});

// Caregiver-facing redemption endpoint.
//
// Body: { code, nric }
//   code — the SMRT.…  string
//   nric — the senior's NRIC, used to verify the code is bound to them
//
// On success: senior's subsidy_pct + copay_low/high are updated and the
// jti is recorded so the code can't be redeemed twice.
promoRoutes.post("/redeem", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    code?: string;
    nric?: string;
    seniorId?: string;
  };
  if (!body.code) return c.json({ error: "code required" }, 400);
  if (!body.nric) return c.json({ error: "nric required" }, 400);

  const result = await verifyCode(body.code);
  if (!result.ok) return c.json({ ok: false, reason: result.reason }, 400);

  const presentedHash = await hashNric(body.nric);
  if (presentedHash !== result.payload.sub) {
    return c.json(
      { ok: false, reason: "This code is for a different NRIC" },
      400,
    );
  }

  const caregiverId = c.get("caregiverId");
  // Default to the caregiver's only senior unless told otherwise.
  let seniorId = body.seniorId;
  if (!seniorId) {
    const row = await c.env.DB.prepare(
      "SELECT id FROM seniors WHERE caregiver_id = ? LIMIT 1",
    )
      .bind(caregiverId)
      .first<{ id: string }>();
    if (!row) return c.json({ ok: false, reason: "no senior under your care" }, 404);
    seniorId = row.id;
  }

  // Confirm the senior's stored NRIC matches the one the caregiver typed.
  const senior = await c.env.DB.prepare(
    "SELECT id, caregiver_id, nric_hash FROM seniors WHERE id = ?",
  )
    .bind(seniorId)
    .first<{ id: string; caregiver_id: string; nric_hash: string | null }>();
  if (!senior) return c.json({ ok: false, reason: "senior not found" }, 404);
  if (senior.caregiver_id !== caregiverId)
    return c.json({ ok: false, reason: "forbidden" }, 403);
  if (senior.nric_hash && senior.nric_hash !== presentedHash) {
    return c.json(
      { ok: false, reason: "NRIC doesn't match the senior's record" },
      400,
    );
  }

  // Replay protection — jti must be unused.
  const seen = await c.env.DB.prepare(
    "SELECT jti FROM redeemed_codes WHERE jti = ?",
  )
    .bind(result.payload.jti)
    .first();
  if (seen) {
    return c.json(
      { ok: false, reason: "This code has already been redeemed" },
      409,
    );
  }

  const tier = result.payload.tier;
  const copay_low = Math.round(40 * (1 - tier / 100));
  const copay_high = Math.round(45 * (1 - tier / 100));

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `UPDATE seniors
            SET subsidy_pct = ?, copay_low = ?, copay_high = ?,
                eligibility_at = ?, nric_hash = COALESCE(nric_hash, ?)
          WHERE id = ?`,
      )
      .bind(
        tier,
        copay_low,
        copay_high,
        new Date().toISOString(),
        presentedHash,
        seniorId,
      ),
    c.env.DB
      .prepare(
        `INSERT INTO redeemed_codes (jti, applied_to_senior, tier, redeemed_by_caregiver)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(result.payload.jti, seniorId, tier, caregiverId),
  ]);

  return c.json({
    ok: true,
    issuer: result.payload.iss,
    tier,
    copay_low,
    copay_high,
    valid_until: result.payload.vt,
    senior_id: seniorId,
  });
});
