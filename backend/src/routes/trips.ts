import { Hono } from "hono";
import { rowToProvider, rowToSenior, rowToTrip, shortRef } from "../db";
import { STAGES, type Env, type Senior, type Trip } from "../types";

export const tripRoutes = new Hono<{
  Bindings: Env;
  Variables: { caregiverId: string };
}>();

// ───────────────────────── stages reference ─────────────────────────

tripRoutes.get("/stages", (c) =>
  c.json({ stages: STAGES.map((label, idx) => ({ idx, label })) }),
);

// ───────────────────────── quote (Grab vs MET) ─────────────────────────
//
// POST /api/trips/quote
// Body: { seniorId: string, hospitalName: string, pickupAt: string }
// Returns a Grab range, an MET range (subsidy applied if cached), and the
// per-trip / yearly savings — the numbers driving the cost-compare screen.
tripRoutes.post("/quote", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    seniorId?: string;
    hospitalName?: string;
    pickupAt?: string;
  };
  if (!body.seniorId) return c.json({ error: "seniorId required" }, 400);

  const senior = await loadSenior(c.env, body.seniorId, c.get("caregiverId"));
  if ("error" in senior) return c.json({ error: senior.error }, senior.status);

  const grabLow = 70;
  const grabHigh = 80;
  // No subsidy applied yet → MET shows the un-subsidised base fare so the
  // cost-compare screen is honest. Once a promo code is redeemed,
  // subsidy_pct + copay_* are populated and MET becomes the cheap option.
  const hasSubsidy =
    typeof senior.subsidy_pct === "number" &&
    senior.copay_low != null &&
    senior.copay_high != null;
  const metLow = hasSubsidy ? senior.copay_low! : 40;
  const metHigh = hasSubsidy ? senior.copay_high! : 45;
  const savePerTrip = Math.round((grabLow + grabHigh) / 2 - (metLow + metHigh) / 2);

  return c.json({
    senior: { id: senior.id, name: senior.name },
    pickupAt: body.pickupAt ?? null,
    hospital: body.hospitalName ?? null,
    grab: { low: grabLow, high: grabHigh },
    met: {
      low: metLow,
      high: metHigh,
      original_low: 40,
      original_high: 45,
      subsidy_pct: hasSubsidy ? senior.subsidy_pct : null,
      has_subsidy: hasSubsidy,
    },
    savings: {
      perTrip: savePerTrip,
      yearlyAt4PerMonth: savePerTrip * 4 * 12,
    },
  });
});

// ───────────────────────── list / get ─────────────────────────

tripRoutes.get("/", async (c) => {
  const caregiverId = c.get("caregiverId");
  const upcoming = await c.env.DB.prepare(
    `SELECT * FROM trips
      WHERE caregiver_id = ? AND status IN ('pending','confirmed','in_progress')
      ORDER BY pickup_at ASC`,
  )
    .bind(caregiverId)
    .all();
  const past = await c.env.DB.prepare(
    `SELECT * FROM trips
      WHERE caregiver_id = ? AND status IN ('completed','cancelled')
      ORDER BY pickup_at DESC LIMIT 20`,
  )
    .bind(caregiverId)
    .all();
  return c.json({
    upcoming: (upcoming.results ?? []).map((r: any) => rowToTrip(r)),
    past: (past.results ?? []).map((r: any) => rowToTrip(r)),
  });
});

tripRoutes.get("/:id", async (c) => {
  const trip = await loadTrip(c.env, c.req.param("id"), c.get("caregiverId"));
  if ("error" in trip) return c.json({ error: trip.error }, trip.status);

  const provider = trip.provider_id
    ? await loadProvider(c.env, trip.provider_id)
    : null;
  const events = await c.env.DB.prepare(
    `SELECT id, stage, status, occurred_at, note
       FROM trip_events WHERE trip_id = ? ORDER BY occurred_at ASC`,
  )
    .bind(trip.id)
    .all();

  // Hydrate the live room from D1 if it's been evicted / never created (e.g.
  // for trips loaded from seed data). hydrate() is idempotent — no-op when the
  // DO already has state.
  await callDo(c.env, trip.id, "/hydrate", {
    stage: trip.stage,
    status: trip.status,
    arrivesAt: trip.arrives_at,
    driver: trip.driver_name
      ? {
          name: trip.driver_name,
          vehicle: trip.driver_vehicle ?? "",
          plate: trip.driver_plate ?? "",
        }
      : null,
    escort: trip.escort_name ? { name: trip.escort_name } : null,
  });
  const live = await fetchDoState(c.env, trip.id);

  return c.json({
    trip,
    provider,
    live,
    stages: STAGES.map((label, idx) => ({ idx, label })),
    events: events.results ?? [],
  });
});

// ───────────────────────── create ─────────────────────────

tripRoutes.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    seniorId?: string;
    providerId?: string;
    hospitalName?: string;
    hospitalAddress?: string;
    pickupAt?: string;
    grabLow?: number;
    grabHigh?: number;
    copay?: number;
  };
  if (!body.seniorId || !body.providerId || !body.hospitalName || !body.pickupAt)
    return c.json(
      { error: "seniorId, providerId, hospitalName, pickupAt all required" },
      400,
    );

  const caregiverId = c.get("caregiverId");
  const senior = await loadSenior(c.env, body.seniorId, caregiverId);
  if ("error" in senior) return c.json({ error: senior.error }, senior.status);
  const provider = await loadProvider(c.env, body.providerId);
  if (!provider) return c.json({ error: "provider not found" }, 404);

  const id = `trip_${crypto.randomUUID().slice(0, 8)}`;
  const reference = shortRef();
  // If the senior has no active subsidy, the booked trip is at full fare
  // (~$42 round trip). After they redeem an AIC promo code, future trips
  // pick up the subsidised co-pay.
  const senior_has_subsidy =
    typeof senior.subsidy_pct === "number" &&
    senior.copay_low != null &&
    senior.copay_high != null;
  const copay =
    body.copay ??
    (senior_has_subsidy
      ? Math.round((senior.copay_low! + senior.copay_high!) / 2)
      : 42);
  const arrivesAt = new Date(
    new Date(body.pickupAt).getTime() + 35 * 60_000,
  ).toISOString();

  // Auto-approval: in production a provider operator confirms by phone and
  // dispatches a driver the day before. For the demo we collapse those two
  // steps so a freshly-booked trip shows up on the caregiver's dashboard as
  // "Confirmed · Driver assigned" — otherwise everything sits in "Pending"
  // and the homepage looks broken.
  const drv = pickDriver();
  const esc = pickEscort();

  await c.env.DB.prepare(
    `INSERT INTO trips
      (id, reference, caregiver_id, senior_id, provider_id, status, stage,
       home_address, hospital_name, hospital_address, pickup_at, arrives_at,
       driver_name, driver_vehicle, driver_plate, escort_name,
       copay, grab_low, grab_high, notify_home_safe)
     VALUES (?, ?, ?, ?, ?, 'confirmed', 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(
      id,
      reference,
      caregiverId,
      senior.id,
      provider.id,
      senior.home_address ?? "",
      body.hospitalName,
      body.hospitalAddress ?? null,
      body.pickupAt,
      arrivesAt,
      drv.name,
      drv.vehicle,
      drv.plate,
      esc,
      copay,
      body.grabLow ?? 70,
      body.grabHigh ?? 80,
    )
    .run();

  // Log all three transitions so the trip-event timeline reads naturally.
  await c.env.DB.batch([
    c.env.DB
      .prepare(`INSERT INTO trip_events (trip_id, stage, status, note) VALUES (?, 0, 'pending', ?)`)
      .bind(id, `Application sent to ${provider.name}`),
    c.env.DB
      .prepare(`INSERT INTO trip_events (trip_id, stage, status, note) VALUES (?, 1, 'confirmed', ?)`)
      .bind(id, `Confirmed by ${provider.name}`),
    c.env.DB
      .prepare(`INSERT INTO trip_events (trip_id, stage, status, note) VALUES (?, 2, 'confirmed', ?)`)
      .bind(id, `Driver ${drv.name} + escort ${esc} assigned`),
  ]);

  // Hydrate the room so a websocket subscriber gets the right snapshot.
  await callDo(c.env, id, "/hydrate", {
    stage: 2,
    status: "confirmed",
    arrivesAt,
    driver: { name: drv.name, vehicle: drv.vehicle, plate: drv.plate },
    escort: { name: esc },
  });

  return c.json(
    {
      trip: { id, reference, status: "confirmed", stage: 2 },
      provider,
      driver: { name: drv.name, vehicle: drv.vehicle, plate: drv.plate },
      escort: { name: esc },
      whatNext: [
        "Provider has confirmed your request",
        "Driver and escort are assigned",
        "We'll send you a reminder the night before pickup",
      ],
    },
    201,
  );
});

// Tiny pools so freshly-booked trips don't all show "Mr. Tan / Mei Ling".
const DRIVER_POOL = [
  { name: "Mr. Tan", vehicle: "Toyota Hiace", plate: "SGW 8421C" },
  { name: "Mr. Singh", vehicle: "Hyundai Starex", plate: "SGV 7301B" },
  { name: "Ms. Wong", vehicle: "Toyota Hiace", plate: "SGZ 5142A" },
  { name: "Mr. Lim", vehicle: "Mercedes Vito", plate: "SLA 9088L" },
];
const ESCORT_POOL = ["Mei Ling", "Suriani", "Pavithra", "Ah Lan", "Siti"];
function pickDriver() {
  return DRIVER_POOL[Math.floor(Math.random() * DRIVER_POOL.length)]!;
}
function pickEscort() {
  return ESCORT_POOL[Math.floor(Math.random() * ESCORT_POOL.length)]!;
}

// ───────────────────────── advance / cancel / notify ─────────────────────────

tripRoutes.post("/:id/advance", async (c) => {
  const trip = await loadTrip(c.env, c.req.param("id"), c.get("caregiverId"));
  if ("error" in trip) return c.json({ error: trip.error }, trip.status);

  const body = (await c.req.json().catch(() => ({}))) as {
    stage?: number;
    note?: string;
  };
  // Hydrate first in case the room has no state yet (worker restart, seed trip).
  await callDo(c.env, trip.id, "/hydrate", {
    stage: trip.stage,
    status: trip.status,
    arrivesAt: trip.arrives_at,
    driver: trip.driver_name
      ? {
          name: trip.driver_name,
          vehicle: trip.driver_vehicle ?? "",
          plate: trip.driver_plate ?? "",
        }
      : null,
    escort: trip.escort_name ? { name: trip.escort_name } : null,
  });
  const next = await callDo(c.env, trip.id, "/advance", body);

  await c.env.DB.prepare(
    `UPDATE trips SET stage = ?, status = ? WHERE id = ?`,
  )
    .bind(next.stage, statusForStage(next.stage), trip.id)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO trip_events (trip_id, stage, status, note) VALUES (?, ?, ?, ?)`,
  )
    .bind(
      trip.id,
      next.stage,
      statusForStage(next.stage),
      body.note ?? STAGES[next.stage] ?? null,
    )
    .run();

  return c.json({ trip: { id: trip.id, stage: next.stage }, live: next });
});

tripRoutes.post("/:id/auto-start", async (c) => {
  const trip = await loadTrip(c.env, c.req.param("id"), c.get("caregiverId"));
  if ("error" in trip) return c.json({ error: trip.error }, trip.status);
  return c.json(await callDo(c.env, trip.id, "/auto-start", {}));
});

tripRoutes.post("/:id/cancel", async (c) => {
  const trip = await loadTrip(c.env, c.req.param("id"), c.get("caregiverId"));
  if ("error" in trip) return c.json({ error: trip.error }, trip.status);
  await c.env.DB.prepare(
    `UPDATE trips SET status = 'cancelled' WHERE id = ?`,
  )
    .bind(trip.id)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO trip_events (trip_id, stage, status, note)
     VALUES (?, ?, 'cancelled', 'Trip cancelled by caregiver')`,
  )
    .bind(trip.id, trip.stage)
    .run();
  return c.json({ ok: true });
});

tripRoutes.patch("/:id/notify", async (c) => {
  const trip = await loadTrip(c.env, c.req.param("id"), c.get("caregiverId"));
  if ("error" in trip) return c.json({ error: trip.error }, trip.status);
  const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
  const enabled = body.enabled === true ? 1 : 0;
  await c.env.DB.prepare(
    `UPDATE trips SET notify_home_safe = ? WHERE id = ?`,
  )
    .bind(enabled, trip.id)
    .run();
  return c.json({ id: trip.id, notify_home_safe: enabled });
});

// ───────────────────────── live websocket ─────────────────────────

tripRoutes.get("/:id/live", async (c) => {
  const trip = await loadTrip(c.env, c.req.param("id"), c.get("caregiverId"));
  if ("error" in trip) return c.json({ error: trip.error }, trip.status);
  const stub = c.env.TRIP_DO.get(c.env.TRIP_DO.idFromName(trip.id));
  return stub.fetch(
    new Request(`https://do/${trip.id}`, {
      headers: { Upgrade: "websocket" },
    }),
  );
});

// ───────────────────────── helpers ─────────────────────────

interface NotFound { error: string; status: 401 | 403 | 404 }

async function loadSenior(
  env: Env,
  id: string,
  caregiverId: string,
): Promise<Senior | NotFound> {
  const row = await env.DB.prepare(
    `SELECT id, caregiver_id, name, age, relation, mobility, conditions_json,
            home_address, postal_code, citizenship, income_band,
            subsidy_pct, copay_low, copay_high, eligibility_at
       FROM seniors WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!row) return { error: "senior not found", status: 404 };
  const senior = rowToSenior(row as any);
  if (senior.caregiver_id !== caregiverId)
    return { error: "forbidden", status: 403 };
  return senior;
}

async function loadTrip(
  env: Env,
  idOrRef: string,
  caregiverId: string,
): Promise<Trip | NotFound> {
  // Accept either the internal id (`trip_xxx`) or the human-visible reference
  // (`MET-XXXXXX`) so the caregiver UI can navigate by what's printed on the
  // confirmation card.
  const row = await env.DB.prepare(
    `SELECT * FROM trips WHERE id = ? OR reference = ? LIMIT 1`,
  )
    .bind(idOrRef, idOrRef)
    .first();
  if (!row) return { error: "trip not found", status: 404 };
  const trip = rowToTrip(row as any);
  if (trip.caregiver_id !== caregiverId)
    return { error: "forbidden", status: 403 };
  return trip;
}

async function loadProvider(env: Env, id: string) {
  const row = await env.DB.prepare(
    `SELECT id, name, initials, bg_color, fg_color, serves, serves_postcodes,
            copay_low, copay_high, response_min, note, phone
       FROM providers WHERE id = ?`,
  )
    .bind(id)
    .first();
  return row ? rowToProvider(row as any) : null;
}

async function callDo(env: Env, tripId: string, path: string, body: unknown) {
  const stub = env.TRIP_DO.get(env.TRIP_DO.idFromName(tripId));
  const res = await stub.fetch(`https://do${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return res.json<any>();
}

async function fetchDoState(env: Env, tripId: string) {
  const stub = env.TRIP_DO.get(env.TRIP_DO.idFromName(tripId));
  const res = await stub.fetch(`https://do/state`);
  return res.json<any>();
}

function statusForStage(stage: number): string {
  if (stage === 0) return "pending";
  if (stage >= STAGES.length - 1) return "in_progress";
  return "confirmed";
}
