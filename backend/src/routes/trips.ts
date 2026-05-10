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
// Body: { seniorId, hospitalName?, pickupAt?, roundTrip? }
// Returns Grab + MET prices for the requested trip type. Round-trip is
// the default — most medical journeys need a return ride and MET
// providers price per round-trip anyway.
tripRoutes.post("/quote", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    seniorId?: string;
    hospitalName?: string;
    pickupAt?: string;
    roundTrip?: boolean;
  };
  if (!body.seniorId) return c.json({ error: "seniorId required" }, 400);

  const senior = await loadSenior(c.env, body.seniorId, c.get("caregiverId"));
  if ("error" in senior) return c.json({ error: senior.error }, senior.status);

  const isRoundTrip = body.roundTrip !== false; // default true

  const hasSubsidy =
    typeof senior.subsidy_pct === "number" &&
    senior.copay_low != null &&
    senior.copay_high != null;

  // Baseline numbers are quoted as round trip ($70-80 Grab, $40-45 MET
  // unsubsidised). One-way is roughly half. MET providers that do support
  // one-way usually charge ~60% of round-trip due to deadhead; we
  // approximate at half + 10% premium.
  const grabRoundLow = 70, grabRoundHigh = 80;
  const metBaseLow = hasSubsidy ? senior.copay_low! : 40;
  const metBaseHigh = hasSubsidy ? senior.copay_high! : 45;

  const grabLow = isRoundTrip ? grabRoundLow : Math.round(grabRoundLow / 2);
  const grabHigh = isRoundTrip ? grabRoundHigh : Math.round(grabRoundHigh / 2);
  const metLow = isRoundTrip ? metBaseLow : Math.round(metBaseLow * 0.6);
  const metHigh = isRoundTrip ? metBaseHigh : Math.round(metBaseHigh * 0.6);

  const savePerTrip = Math.round((grabLow + grabHigh) / 2 - (metLow + metHigh) / 2);

  return c.json({
    senior: { id: senior.id, name: senior.name },
    pickupAt: body.pickupAt ?? null,
    hospital: body.hospitalName ?? null,
    roundTrip: isRoundTrip,
    grab: { low: grabLow, high: grabHigh },
    met: {
      low: metLow,
      high: metHigh,
      original_low: isRoundTrip ? 40 : 24,
      original_high: isRoundTrip ? 45 : 27,
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
    roundTrip?: boolean;
    returnAt?: string; // ISO 8601, return pickup at hospital
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
  const isRoundTrip = body.roundTrip !== false; // default true

  const senior_has_subsidy =
    typeof senior.subsidy_pct === "number" &&
    senior.copay_low != null &&
    senior.copay_high != null;

  // Co-pay is round-trip price by default. One-way is ~60% of round trip.
  const baseCopay = senior_has_subsidy
    ? Math.round((senior.copay_low! + senior.copay_high!) / 2)
    : 42;
  const copay = body.copay ?? (isRoundTrip ? baseCopay : Math.round(baseCopay * 0.6));

  const grabLow = body.grabLow ?? (isRoundTrip ? 70 : 35);
  const grabHigh = body.grabHigh ?? (isRoundTrip ? 80 : 40);

  const arrivesAt = new Date(
    new Date(body.pickupAt).getTime() + 35 * 60_000,
  ).toISOString();

  // Default return = pickup + 2 hours (typical specialist appointment).
  const returnPickupAt = isRoundTrip
    ? body.returnAt ??
      new Date(new Date(body.pickupAt).getTime() + 2 * 60 * 60_000).toISOString()
    : null;
  const returnArrivesAt = returnPickupAt
    ? new Date(new Date(returnPickupAt).getTime() + 35 * 60_000).toISOString()
    : null;

  await c.env.DB.prepare(
    `INSERT INTO trips
      (id, reference, caregiver_id, senior_id, provider_id, status, stage,
       home_address, hospital_name, hospital_address, pickup_at, arrives_at,
       is_round_trip, return_pickup_at, return_arrives_at,
       copay, grab_low, grab_high, notify_home_safe)
     VALUES (?, ?, ?, ?, ?, 'confirmed', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
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
      isRoundTrip ? 1 : 0,
      returnPickupAt,
      returnArrivesAt,
      copay,
      grabLow,
      grabHigh,
    )
    .run();

  await c.env.DB.batch([
    c.env.DB
      .prepare(`INSERT INTO trip_events (trip_id, stage, status, note) VALUES (?, 0, 'pending', ?)`)
      .bind(id, `Application sent to ${provider.name}`),
    c.env.DB
      .prepare(`INSERT INTO trip_events (trip_id, stage, status, note) VALUES (?, 1, 'confirmed', ?)`)
      .bind(id, `Confirmed by ${provider.name}`),
  ]);

  await callDo(c.env, id, "/hydrate", {
    stage: 1,
    status: "confirmed",
    arrivesAt,
    driver: null,
    escort: null,
  });

  return c.json(
    {
      trip: {
        id,
        reference,
        status: "confirmed",
        stage: 1,
        is_round_trip: isRoundTrip ? 1 : 0,
        return_pickup_at: returnPickupAt,
        return_arrives_at: returnArrivesAt,
      },
      provider,
      whatNext: [
        "Provider has confirmed your request",
        "Driver and escort assigned the day before pickup",
        isRoundTrip
          ? "Return ride is locked in for after the appointment"
          : "We'll send you a reminder + live tracking link then",
      ],
    },
    201,
  );
});

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
