# Smarties — The Good Hack 2026

**Hackathon**: The Good Hack 2026 (GoodHub SEA × Open Government Products), 8–10 May 2026, Singapore.
**Problem Statement 2 — Streamlining Eldercare**: How might we reduce manual and time-consuming tasks within the eldercare ecosystem so that more seniors are well-supported?

## Concept

An integrated, voice-first companion app that turns a senior's medical appointment into a tracked, dialect-friendly journey — from appointment letter to "home safe" — with one dashboard for the caregiver.

Three surfaces, one backend:
- **Senior PWA / SMS-IVR**: voice-first, dialect-friendly (Mandarin, Hokkien, Teochew, Malay, Tamil).
- **Caregiver dashboard**: live, delivery-style stage tracker for the senior's full appointment journey.
- **Driver / volunteer app**: pickup, accessibility notes, geofenced stage transitions.

## Killer differentiator

Treat each appointment as a tracked journey with explicit stages — like a parcel delivery:

```
Letter received → Translated → Confirmed
Driver assigned → En route to pickup → Senior boarded
Arrived at hospital → Checked in → In consult
At pharmacy → Bill paid
Return ride dispatched → Home safe
```

Each stage is a real state-machine transition (Cloudflare Durable Object), advanced by driver taps, geofence crossings, or senior voice confirmations. Caregiver gets live updates instead of refresh-calling.

## Stack

- **Cloudflare Workers** + Durable Objects (per-trip state machine), D1, KV, R2, Queues.
- **Cloudflare Workers AI / SEA-LION** (AI Singapore) — translation, dialect summaries, voice.
- **OpenAI** — Vision OCR of appointment letters; Whisper for consult transcription.
- **Lovable** — three PWA frontends.
- **Twilio** (stretch) — SMS / IVR fallback for non-smartphone seniors.

## MVP golden path (Demo Day)

1. Caregiver photographs an appointment letter → OCR + SEA-LION extraction → confirmed in dashboard (English) and senior app (dialect).
2. Trip state machine advances through 6–8 stages, with one geofence trigger.
3. Caregiver sees live updates via WebSocket. "Home safe" push at the end.

## Pain points anchored in the pitch (pick 2–3)

1. **Appointment letter literacy** — dense English letters that dialect-speaking seniors can't read.
2. **Caregiver visibility gap** — no idea where the senior is or what stage of the trip they're at.
3. **Return-ride overrun** — consult runs 90 min late, original return ride is wasted, senior strands.

## Team

Smarties — The Good Hack 2026.
