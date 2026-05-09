# Smarties — The Good Hack 2026

**Hackathon**: The Good Hack 2026 (GoodHub SEA × Open Government Products), 8–10 May 2026, Singapore.
**Problem Statement 2 — Streamlining Eldercare**: How might we reduce manual and time-consuming tasks within the eldercare ecosystem so that more seniors are well-supported?

## Concept

A caregiver app that streamlines discovery and booking of subsidised Medical Escort & Transport (MET) services in Singapore. The flagship moment is the **cost comparison** between commercial ride-hail (Grab/taxi) and subsidised MET — surfacing the savings so caregivers don't default to the expensive option out of habit. After booking, the caregiver gets a live, delivery-style trip tracker.

## Core flows

1. **Eligibility wizard** — 4 questions → soft subsidy verdict (subsidy %, co-pay range).
2. **Cost comparison** — Grab vs MET side-by-side with per-trip and yearly savings.
3. **Provider directory** — community providers serving the senior's postal area. Each provider has a `tel:` Call button; booking is confirmed by phone, matching the real-world process.
4. **Live trip tracker** — 6-stage stepper, pushed live to the caregiver via WebSocket from a Durable Object.

The 6 stages: Application sent → Confirmed by provider → Driver assigned → En route to pickup → Senior boarded → Arrived at hospital.

## Stack

- **Cloudflare Workers** + **Hono** for the API.
- **Cloudflare D1** for caregivers, seniors, providers, trips, and the trip-event log.
- **Cloudflare Durable Objects** — one `TripRoom` per trip; holds live stage state and fans out WebSocket updates.
- **TypeScript**.

## Repo layout

- `backend/` — Cloudflare Worker. Schema, seed, full API, README with curl examples.

## Pain points anchored in the pitch

1. **Discovery gap** — many eligible seniors never apply for the AIC-coordinated MET subsidy. The eligibility wizard surfaces a credible verdict in 30 seconds.
2. **Caregiver visibility gap** — phone-tag with provider replaced by a live, delivery-style stage tracker.
3. **Default-Grab habit** — cost-compare screen converts a $32–$38 ride into a ~$10–14 subsidised one.

## Team

Smarties — The Good Hack 2026.
