import { Hono } from "hono";
import type { Env } from "../types";

// Demo-only utility endpoints — should not exist in production.

export const demoRoutes = new Hono<{
  Bindings: Env;
  Variables: { caregiverId: string };
}>();

// IDs of trips that ship with the seed — preserved by reset-all so the
// demo dashboard always has the curated examples on first load.
const SEEDED_TRIP_IDS = [
  "trip_upcoming",
  "trip_upcoming_2",
  "trip_past_1",
  "trip_past_2",
  "trip_past_3",
];

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

// Full reset for demo: wipe the senior's subsidy, all user-created
// trips and their events, plus the redeemed_codes audit log. Seeded
// trips and providers are preserved. Called automatically on Singpass
// login so each fresh demo run lands on a clean baseline.
demoRoutes.post("/reset-all", async (c) => {
  const caregiverId = c.get("caregiverId");
  const placeholders = SEEDED_TRIP_IDS.map(() => "?").join(",");

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `UPDATE seniors
            SET subsidy_pct = NULL, copay_low = NULL, copay_high = NULL,
                eligibility_at = NULL
          WHERE caregiver_id = ?`,
      )
      .bind(caregiverId),
    c.env.DB
      .prepare(
        `DELETE FROM trip_events
          WHERE trip_id NOT IN (${placeholders})`,
      )
      .bind(...SEEDED_TRIP_IDS),
    c.env.DB
      .prepare(
        `DELETE FROM trips
          WHERE id NOT IN (${placeholders})
            AND caregiver_id = ?`,
      )
      .bind(...SEEDED_TRIP_IDS, caregiverId),
    c.env.DB.prepare(`DELETE FROM redeemed_codes`),
  ]);

  return c.json({ ok: true });
});
