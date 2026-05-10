# Smarties — The Good Hack 2026

**Hackathon**: The Good Hack 2026 (GoodHub SEA × Open Government Products), 8–10 May 2026, Singapore.
**Problem Statement 2 — Streamlining Eldercare**: How might we reduce manual and time-consuming tasks within the eldercare ecosystem so that more seniors are well-supported?

## Live deployment

- **Caregiver app (frontend)** — https://smarties-met-265643957903.asia-southeast1.run.app
- **API (backend)** — https://smarties-backend.7ommyquak.workers.dev

## Concept

A caregiver app that streamlines discovery and booking of subsidised Medical Escort & Transport (MET) services in Singapore. The flagship moment is the **cost comparison** between commercial ride-hail (Grab/taxi) and subsidised MET — surfacing the savings so caregivers don't default to the expensive option out of habit. After booking, the caregiver gets a live, delivery-style trip tracker.

## Core flows

1. **Singpass-mock login** — splash page that demonstrates the auth ceremony before entering the app.
2. **Eligibility wizard** — 4 questions confirming the senior's eligibility (no fake subsidy estimate; the real subsidy comes from a signed code).
3. **Cost comparison** — Grab vs MET side-by-side. MET shows the un-subsidised base fare until a subsidy code is applied.
4. **Provider directory** — community providers serving the senior's postal area. Choose one, the booking is auto-approved with a driver pre-assigned.
5. **Live trip tracker** — 6-stage stepper, pushed live to the caregiver via WebSocket from a Durable Object. OneMap basemap with an animated driver pin.
6. **Subsidy code redemption** — paste an Ed25519-signed code on Profile. Backend verifies the signature, NRIC binding, and validity window, then applies the subsidy. The senior's "Active subsidy" card materialises.

The 6 stages: Application sent → Confirmed by provider → Driver assigned → En route to pickup → Senior boarded → Arrived at hospital.

## Stack

- **Cloudflare Workers** + **Hono** for the API.
- **Cloudflare D1** for caregivers, seniors, providers, trips and the trip-event log.
- **Cloudflare Durable Objects** — one `TripRoom` per trip; holds live stage state and fans out WebSocket updates.
- **Ed25519** (WebCrypto) for the signed subsidy codes; verified offline against the issuer's public key.
- **TypeScript**.
- **OneMap** (Singapore Land Authority) for the live tracker basemap.
- Static **React + Tailwind** prototype frontend, served via Google Cloud Run (asia-southeast1).

## Repo layout

- `backend/` — Cloudflare Worker. Schema, seed, full API, README with curl examples.
- `prototype/` — Static caregiver app. Open `prototype/index.html` directly to run locally, or `gcloud run deploy --source prototype/` to ship.
  - `prototype/HANDOFF.md` — original design handoff brief (visual specs, copy decisions).

## Pain points anchored in the pitch

1. **Discovery gap** — many eligible seniors never apply for the AIC-coordinated MET subsidy. The signed-code flow lets the hospital Medical Social Worker (MSW) — the same role that certifies need today via the paper referral pipeline — issue an Ed25519-signed authorisation offline, redeemable in seconds rather than weeks. Polyclinic doctors and AIC Link officers can also issue under AIC's delegated authority.
2. **Caregiver visibility gap** — phone-tag with provider replaced by a live, delivery-style stage tracker.
3. **Default-Grab habit** — cost-compare screen converts a $32–$38 ride into a ~$8–$14 subsidised one (after applying a code).

## Run locally

### Backend
```bash
cd backend
npm install
npx wrangler login
# create D1 + KV (one-time, copy ids into wrangler.jsonc)
npx wrangler d1 create smarties
npx wrangler kv namespace create CACHE
npm run db:reset
npm run dev
```

### Frontend
```bash
cd prototype
python3 -m http.server 5173
# open http://127.0.0.1:5173
```

`prototype/env.js` auto-points the frontend at `localhost:8787` for `127.0.0.1`/`localhost` hosts and at the deployed Worker otherwise.

## Team

Smarties — The Good Hack 2026.
