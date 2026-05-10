import { Hono } from "hono";
import type { Env } from "../types";

// Demo-only utility endpoints — should not exist in production.

export const demoRoutes = new Hono<{
  Bindings: Env;
  Variables: { caregiverId: string };
}>();

// Clear the senior's subsidy so the user can re-demo the redemption flow.
demoRoutes.post("/reset-subsidy", async (c) => {
  const caregiverId = c.get("caregiverId");
  const row = await c.env.DB.prepare(
    "SELECT id FROM seniors WHERE caregiver_id = ? LIMIT 1",
  )
    .bind(caregiverId)
    .first<{ id: string }>();
  if (!row) return c.json({ ok: false, reason: "no senior" }, 404);

  await c.env.DB.prepare(
    `UPDATE seniors
        SET subsidy_pct = NULL, copay_low = NULL, copay_high = NULL,
            eligibility_at = NULL
      WHERE id = ?`,
  )
    .bind(row.id)
    .run();

  return c.json({ ok: true, senior_id: row.id });
});
