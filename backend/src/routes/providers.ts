import { Hono } from "hono";
import { rowToProvider } from "../db";
import type { Env } from "../types";

export const providerRoutes = new Hono<{ Bindings: Env }>();

// GET /api/providers?postalCode=560234
// Returns providers whose serves_postcodes JSON includes the 2-digit prefix.
// Postal-code geofencing is rough; real implementation would join against a
// proper service-area polygon table.
providerRoutes.get("/", async (c) => {
  const postal = (c.req.query("postalCode") ?? "").trim();
  const all = await c.env.DB.prepare(
    `SELECT id, name, initials, bg_color, fg_color, serves, serves_postcodes,
            copay_low, copay_high, response_min, note, phone
       FROM providers
       ORDER BY response_min ASC`,
  ).all();

  const providers = (all.results ?? []).map((r: any) => rowToProvider(r));

  if (!postal) return c.json({ providers });
  const prefix = postal.padStart(2, "0").slice(0, 2);
  const filtered = providers.filter((p) => p.serves_postcodes.includes(prefix));
  return c.json({ providers: filtered });
});
