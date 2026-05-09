import { Hono } from "hono";
import { rowToSenior } from "../db";
import type { Env } from "../types";

export const meRoutes = new Hono<{ Bindings: Env; Variables: { caregiverId: string } }>();

meRoutes.get("/", async (c) => {
  const caregiverId = c.get("caregiverId");
  const cg = await c.env.DB.prepare(
    "SELECT id, name, email, phone, language FROM caregivers WHERE id = ?",
  )
    .bind(caregiverId)
    .first();
  if (!cg) return c.json({ error: "session expired" }, 401);

  const seniors = await c.env.DB.prepare(
    `SELECT id, caregiver_id, name, age, relation, mobility, conditions_json,
            home_address, postal_code, citizenship, income_band,
            subsidy_pct, copay_low, copay_high, eligibility_at
       FROM seniors WHERE caregiver_id = ?
       ORDER BY name`,
  )
    .bind(caregiverId)
    .all();

  return c.json({
    caregiver: cg,
    seniors: (seniors.results ?? []).map((r: any) => rowToSenior(r)),
  });
});

meRoutes.patch("/language", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { language?: string };
  const lang = body.language;
  if (!lang || !["en", "zh", "ms", "ta"].includes(lang)) {
    return c.json({ error: "language must be one of en|zh|ms|ta" }, 400);
  }
  await c.env.DB.prepare("UPDATE caregivers SET language = ? WHERE id = ?")
    .bind(lang, c.get("caregiverId"))
    .run();
  return c.json({ ok: true, language: lang });
});
