# CareHop — Backend (Cloudflare Workers)

API + live trip state machine for the CareHop caregiver app.

## Stack

- **Cloudflare Workers** + **Hono** for the HTTP API
- **D1** (SQLite at the edge) for caregivers, seniors, providers, trips, events
- **Durable Objects** — one `TripRoom` per active trip, holds the live stage and fans out WebSocket updates
- **KV** for cache (currently unused, wired)
- **Workers AI** binding for SEA-LION (AI Singapore) — wired, used by future routes for letter parsing / summarisation

## First-time setup

```bash
cd backend
npm install

# 1. Create the D1 database. Copy the printed database_id into wrangler.jsonc.
npx wrangler d1 create smarties

# 2. Create the KV namespace. Copy the printed id into wrangler.jsonc.
npx wrangler kv namespace create CACHE

# 3. Init the schema + seed locally.
npm run db:reset
```

## Run locally

```bash
npm run dev
# Worker on http://localhost:8787
```

Smoke test:

```bash
# Login (mock — returns the seeded caregiver Wei Ming)
curl -s -X POST http://localhost:8787/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"weiming@smarties.demo"}' | jq

# Everything else uses X-Caregiver-Id: cg_weiming
curl -s http://localhost:8787/api/me -H 'X-Caregiver-Id: cg_weiming' | jq
curl -s http://localhost:8787/api/providers?postalCode=560234 | jq
curl -s -X POST http://localhost:8787/api/trips/quote \
  -H 'content-type: application/json' -H 'X-Caregiver-Id: cg_weiming' \
  -d '{"seniorId":"sn_madamlim","hospitalName":"SGH","pickupAt":"2026-05-15T09:00:00+08:00"}' | jq

# Watch the seeded trip
curl -s http://localhost:8787/api/trips/trip_upcoming \
  -H 'X-Caregiver-Id: cg_weiming' | jq

# Push a stage (driver app would do this)
curl -s -X POST http://localhost:8787/api/trips/trip_upcoming/advance \
  -H 'content-type: application/json' -H 'X-Caregiver-Id: cg_weiming' \
  -d '{"note":"En route to pickup"}' | jq
```

WebSocket (live caregiver dashboard):

```js
const ws = new WebSocket("ws://localhost:8787/api/trips/trip_upcoming/live", [], {
  headers: { "X-Caregiver-Id": "cg_weiming" }, // browsers can't set this, use a token in URL for prod
});
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

> **Browser caveat**: the WS handshake can't carry custom headers. For the hackathon, change the route to read `?caregiverId=...` from the query string before shipping the senior/caregiver PWAs. Driver app on Node can use headers as-is.

## Deploy

```bash
npm run db:init:remote
npm run db:seed:remote
npm run deploy
```

## API surface

| Method | Path | What it does |
|---|---|---|
| POST   | `/api/auth/login` | Mock login by email; returns caregiver + session |
| GET    | `/api/me` | Caregiver + seniors under care |
| PATCH  | `/api/me/language` | Persist UI language preference |
| POST   | `/api/eligibility/check` | Stateless verdict (subsidy %, co-pay range) |
| POST   | `/api/eligibility/seniors/:id` | Persist verdict against a senior |
| GET    | `/api/providers?postalCode=560234` | Providers serving that area |
| POST   | `/api/trips/quote` | Grab vs. MET cost compare + savings |
| GET    | `/api/trips` | Upcoming + past trips for the caregiver |
| POST   | `/api/trips` | Book a trip → `{ id, reference, whatNext }` |
| GET    | `/api/trips/:id` | Full trip + provider + live stage + events |
| POST   | `/api/trips/:id/advance` | Move stage forward (driver/admin); broadcasts live |
| POST   | `/api/trips/:id/auto-start` | Demo: auto-tick stage every N seconds |
| POST   | `/api/trips/:id/cancel` | Cancel + log event |
| PATCH  | `/api/trips/:id/notify` | Toggle "notify me when home safe" |
| GET    | `/api/trips/:id/live` | WebSocket — `{type:"snapshot"}` then `{type:"stage"}` |
| GET    | `/api/trips/stages` | The 6-stage label list (i18n done client-side) |

## Schema notes

- `seniors.subsidy_pct/copay_low/copay_high` are **cached** from the eligibility wizard so the home/quote screens don't re-ask. Re-running `/api/eligibility/seniors/:id` overwrites them.
- `providers.serves_postcodes` is a JSON array of 2-digit postal-code prefixes. Crude geofence — replace with a real service-area model post-hackathon.
- `trip_events` is the audit log. The Durable Object holds the live state; D1 is the source of truth on reload.

## Seed

`seed.sql` mirrors `prototype/data.jsx`:

- Caregiver `cg_weiming` (Wei Ming, `weiming@smarties.demo`)
- Senior `sn_madamlim` (Madam Lim Soo Hoon, 78, walking aid, AMK Ave 3)
- Providers `touch`, `blossom`, `hca`
- Upcoming trip `trip_upcoming` (reference `MET-2A4F19`) at stage 2 — the tracker has driver Mr. Tan + escort Mei Ling already
- 3 past trips for the Trips list

Run `npm run db:reset` to re-seed at any point.

## What's deliberately not here

- Real auth (Singpass / OIDC) — `X-Caregiver-Id` is a stand-in
- Real Grab pricing — uses the prototype's `$32–$38` band
- Real subsidy table — uses the prototype's placeholder formula in `src/eligibility.ts`
- SEA-LION calls — binding wired, no routes yet (next: `/api/letter/parse`, `/api/translate`)
- SMS / push fallback — `notify_home_safe` flag is stored, sender is TBD (Twilio is the plan)
