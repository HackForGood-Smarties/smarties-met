# Handoff: Smarties — Medical Escort & Transport (MET) Caregiver App

## Overview
Smarties is a mobile-first PWA that helps **caregivers in Singapore** book subsidised Medical Escort & Transport (MET) rides for the seniors they look after. The flagship moment is the **cost comparison** between commercial ride-hail (Grab/taxi) and subsidised MET — making the saving the headline so caregivers don't default to the expensive option out of habit.

Five core flows ship in this prototype:

1. **Home** — greeting, next-trip card, quick actions, tips
2. **Onboarding / eligibility wizard** — 4 questions → soft subsidy verdict
3. **Trip new** — Grab vs. MET cost comparison
4. **Providers** — pick from 3 community providers
5. **Apply** — confirmation + reference number
6. **Trip tracker** — 6-stage stepper, fake map, notify-me toggle
7. **Trips list** + **Profile** — supporting screens

The app speaks **English, 中文, Bahasa Melayu, தமிழ்** — language switches live with no reload, and the dictionary covers every screen.

---

## About the Design Files
The files under `prototype/` are **design references built in HTML/JSX** — they show intended look, copy, layout, and motion. They are **not production code to copy verbatim**. Your task is to **recreate these designs in the target codebase's existing environment** (React Native, native iOS/Android, Flutter, web React, whatever ships) using its established patterns, component library, and design tokens. If no codebase exists yet, pick the framework that fits the team — React Native or Flutter are both reasonable for a Singapore-government-adjacent caregiver app.

The prototype loads React + Babel from CDNs and uses Tailwind via the JIT script tag — that is purely so the prototype runs in a single HTML file. **Do not** ship Tailwind-CDN-via-script in production.

---

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows, motion timings, and copy are all final-direction. Recreate pixel-perfectly using your codebase's existing primitives. The only deliberately-loose bits are:

- The fake SVG map on the trip tracker — replace with the real map SDK (Google Maps, Mapbox, OneMap SG)
- Provider logos — currently coloured monogram tiles; swap for real brand marks if/when partners agree
- The eligibility math — a placeholder formula based on PR status, age, mobility and income band; replace with the real subsidy table from MOH / AIC

---

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| `paper` | `#FAF7F2` | App background (warm off-white) |
| `paper2` | `#F2EDE3` | Surface tint (soft chips, idle nav, route-row icon bg) |
| `ink` | `#0B2545` | Primary text + dark hero surface |
| `ink2` | `#13325E` | Secondary navy (hover state on `ink`) |
| `mute` | `#5B6B82` | Secondary / tertiary text |
| `line` | `#E4DCCC` | Hairlines, card borders |
| `gold` | `#D4A24C` | Primary CTA, MET highlight, active step |
| `goldSoft` | `#F6E7C5` | Pill bg, active nav pill, calendar-icon bg |
| `green` | `#1F7A4D` | Success / confirmed / completed step |
| `greenSoft` | `#E3F1E8` | Success surface (banners, savings strip) |
| `danger` | `#B23A3A` | Destructive (Cancel trip) |

App background outside the phone frame is `#EDE7DA` (slightly darker than `paper`) — only relevant on tablet/desktop where the phone is centered.

### Typography
- **Family**: Inter (Latin) + Noto Sans SC (Chinese) + Noto Sans Tamil (Tamil), single stack: `Inter, "Noto Sans SC", "Noto Sans Tamil", system-ui, sans-serif`
- **Antialiasing**: `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility`
- **Scale** (px / weight / line-height / tracking):
  - Display number (savings, ETA, age, MET price): **44–64 / 700 / 1 / -0.02em**
  - Page title (`SubHeader`, eligibility verdict): **22–28 / 700 / 1.15**
  - Section heading: **18 / 700 / 1.2**
  - Body / list item: **15–17 / 500–600 / 1.4**
  - Pill / eyebrow / uppercase label: **11–12 / 600 / 1.2 / 0.04em uppercase**
  - Button label: **15–17 / 600**

### Spacing
4-pt baseline. Cards use **20px** internal padding (`p-5`), tight cards **16px** (`p-4`). Page gutter is **20px** (`px-5`). Section gap **20–24px** (`mt-5` / `mt-6`).

### Radii
- Buttons / inputs: **12px**
- Cards: **16px** (`rounded-2xl`)
- Pills / chips: **999px**
- Hero surfaces (savings banner, ETA card): **16px**
- Phone frame on desktop: **24px** (`rounded-3xl`)

### Shadows
- `card`: `0 1px 0 rgba(11,37,69,.04), 0 1px 2px rgba(11,37,69,.06)` — default card lift
- `lift`: `0 1px 0 rgba(11,37,69,.04), 0 8px 24px -8px rgba(212,162,76,.35), 0 2px 6px rgba(11,37,69,.08)` — primary CTA + featured MET card

### Motion
- Page transition: 220ms ease-out, 4px upward translate + opacity (`pageIn` keyframes)
- Active stepper pulse: gold ring expanding 0→10px over 2s, infinite (`pulseGold`)
- Hash route change: scroll to top, no horizontal slide
- Toggle thumb: `transition-all` 150ms

### Iconography
Inline SVG, 24×24 viewBox, **1.7 stroke**, round caps, round joins. No fills. Set used in prototype: home, trips (truck loop), profile, back, right, check, spark, wheelchair, shield, phone, pin, clock, edit, info, globe, alert, bell, heart, calendar, car, van, doc, dollar, plus. Replace with your codebase's existing icon set if it has one — match the **24px / 1.7 stroke / round** spec, not the literal paths.

---

## Component Inventory

### Primitives (`prototype/ui.jsx`)
| Component | Spec |
|---|---|
| `Card` | `bg-white rounded-2xl border border-line shadow-card` |
| `Btn` | 4 sizes, 7 kinds. Sizes: `lg=56px h`, `md=48px`, `sm=40px`. Kinds: `primary` (gold + lift shadow), `primaryNavy`, `outline`, `ghost`, `soft` (paper2), `green`, `danger`. All have `focus-ring` (3px gold outline at 2px offset). |
| `Pill` | Tones: `neutral` (paper2/ink2), `gold` (goldSoft + gold border), `green` (greenSoft + green), `navy`. Always 2.5×1 padding, 12px text, 600 weight. |
| `Divider` | 1px `bg-line` |
| `TopBar` | Sticky, 56px tall, max-width 720px, paper background at 85% with backdrop-blur. Logo (S monogram in ink square) + title + tag. Right side: language pill with `globe` icon + EN/中文/BM/தமிழ் dropdown. |
| `BottomNav` | Sticky bottom, 3-col grid, 64px min-height per cell, safe-area inset bottom. Active item gets `goldSoft` rounded-full pill behind icon, ink text; idle is mute. |
| `Phone` | Centers content into a 720px-max column with rounded-3xl frame on ≥sm viewport. On mobile it's full-bleed. |
| `SubHeader` | Optional 44×44 back-arrow circle + 22px page title. |
| `RouteRow` | Icon tile (36×36, `paper2` or `ink` variant) + uppercase eyebrow + truncating value + chevron. Used for home/hospital/time. |

### Screen-specific components
- **`ChoiceList`** (onboarding) — vertical stack of 64px-min-height tiles. Selected: `border-gold + bg-goldSoft/40 + ring-2 ring-gold` and a filled ink check disc on the right. Unselected: `border-line bg-white`.
- **`QuestionLayout`** — 26px bold title + mute sub + content slot.
- **Stepper** (trip tracker) — 36px circle nodes connected by 2px vertical line. States:
  - `done`: green-filled disc with white check
  - `active`: gold disc with ink number, 4px gold-25% ring, `pulseGold` animation
  - `idle`: paper2 disc with mute number and line border
  - Connector segments: `step-line` class — `done` is solid green, `active` is green→gold gradient, idle is `line` color.
- **Cost compare cards** (trip new) — equal-width grid-cols-2, 16px gap. Grab card uses muted everything; MET card is `border-2 border-gold` with `shadow-lift`, has a gold "Subsidised" pill anchored at `-top-2.5 right-3`, and prints the price as **64px / 700** with the original `$40` struck-through above it at 15px.

---

## Screens

### 1. Home (`#/home`)
**Purpose**: caregiver lands here, sees their next trip, books a new one.

**Layout** (top→bottom, 20px page gutter):
1. Greeting block — mute "Good morning," + 26px name + mute "Caring for **Madam Lim** · 78"
2. **Next trip card** — calendar tile + date/time + route + "Confirmed" pill + "$12 co-pay" pill + "View trip status" primary button + outline phone button
3. **Quick actions** — 2-col grid: "Book a new ride" (ink tile) + "Check eligibility" (greenSoft tile). Each is a `Card` with a 40×40 colored icon tile and a 2-line bold label.
4. **Tips** — single Card with 2 dividers: "Bring along" (IC, appointment letter, regular medication), "Tell the escort" (allergies, mobility, hearing aid).

**Removed in latest revision**: the navy "saved this year — $284" hero banner. It was visually strong but made the app feel like a financial product instead of a care product. Don't reintroduce without a product call.

### 2. Onboarding / Eligibility (`#/onboarding`)
**Purpose**: 30-second triage to set expectation that subsidies are real and likely.

**Structure**: 4 questions + 1 verdict screen (5 total). Top progress dots (filled = current/past, line = future). Sticky footer with Back / Next; Next is disabled until the current question is answered.

**Questions**:
1. **Citizen / PR?** — 2-option `ChoiceList` (yes / no, neither). Eligibility requires `yes`.
2. **Age?** — bespoke −/+ stepper with **64px** centered numeral, default `75`, clamp 40–110. The big number is the touch focus, not the buttons.
3. **Mobility** — 3-option `ChoiceList` with icons (`spark` / `shield` / `wheelchair`). Wheelchair grants +5% subsidy in the placeholder formula.
4. **Household income per person** — 4-option list (under $1,200 / $1,200–2,800 / over $2,800 / not sure).

**Verdict screen**: green check disc → "Likely eligible." → 2-col Card with **subsidy %** (56px) and **co-pay $X–$Y per round trip** (40px) → primary "Find a ride" button → routes to `/trip/new`.

**Placeholder formula** (replace with real table):
```js
let subsidy = 50;
if (inc === "inc1") subsidy = 80;
else if (inc === "inc2") subsidy = 70;
else if (inc === "inc3") subsidy = 50;
else subsidy = 65;
if (mob === "mobChair") subsidy = Math.min(85, subsidy + 5);
const coPayLow  = Math.round(40 * (1 - subsidy / 100));
const coPayHigh = Math.round(45 * (1 - subsidy / 100));
```

### 3. Trip New / Cost Compare (`#/trip/new`)
**Purpose**: the conversion moment. Show MET is dramatically cheaper without making it feel cheap.

**Layout**:
1. SubHeader "Book a ride" + sub-line "Compare your options before you book."
2. **Trip details card** — three `RouteRow`s: home (paper2 icon), dashed vertical separator (18px left margin), hospital (ink icon = destination), divider, time row.
3. **"Side by side" eyebrow + 2-col compare grid** — see component spec above.
4. **Savings strip** — `greenSoft` card with green check disc and "You save ~$23 per trip / ≈ $1,100 a year at 4 trips/month".
5. **"Why MET costs less" info card** — small `info` icon + explanation copy.

CTAs: Grab button is muted outline (intentionally less attractive). MET button is gold primary with chevron and routes to `/providers`.

### 4. Providers (`#/providers`)
**Purpose**: pick a community partner. Three providers, stacked. Reassuring footer "you can change any time."

Each card:
- 56×56 monogram tile (provider's brand color as bg, soft contrasting fg)
- Name (17 / 700) + serves-area line + "Serves your area" green pill
- Description copy
- Divider
- 3-col foot row: **Co-pay** ($10–14), **Replies in** (~6 min), **Choose →** primary button

Mock providers ship with: TOUCH Community Services (navy tile), Blossom Seeds (green tile), HCA Hospice Care (gold tile). Replace with the real list from your partnerships team.

### 5. Apply / Confirmation (`#/apply/:providerId`)
**Purpose**: low-anxiety confirmation. They've sent a request, not made a payment.

Centered green check (80×80 disc) → "Application sent to [Provider Name]" → reassurance copy → **reference card** (mono ref number) → trip details → **What happens next** numbered list (1: provider reviews, 2: confirms by phone, 3: driver assigned day before) → outline "Add to calendar" + primary "View trip status".

### 6. Trip Tracker (`#/trip/:id`)
**Purpose**: real-time status during the trip.

**Layout**:
1. SubHeader "Live trip status"
2. **Ink hero card** — ETA label + 44px time + date on left; current-stage gold pill + reference number on right
3. **Driver card** (only shown once `active >= 2`) — initials avatar + driver+escort names + vehicle plate + outline call button
4. **6-stage vertical stepper** in a Card — see component spec
5. **Map** — 16:10 aspect, currently SVG fake (grid pattern + roads + dashed route + endpoint dots), replace with real map. Caption overlay: "Live map will appear here once driver is en route."
6. **Notify toggle** Card — bell icon + "Notify me when home safe" + iOS-style toggle (8h × 14w pill, green when on)
7. Footer row: outline "Contact provider" + danger "Cancel trip"

The prototype auto-advances the stepper every 6s as a demo affordance — replace with real backend events. Stage strings (translated): "Application sent", "Confirmed by provider", "Driver assigned", "En route to pickup", "Senior boarded", "Arrived at hospital".

### 7. Trips List (`#/trips`)
Two sections: **Upcoming** (one card, links to tracker) and **Past** (3-row card, simple date + route + price). Past rows have a paper2 disc with a check icon.

### 8. Profile (`#/profile`)
- Caregiver header (initials disc + name + relation line)
- **Senior card** — name, age, relation, mobility aid, condition pills, divider, subsidy estimate (28px) + outline "Re-check eligibility" button (routes to `/onboarding`)
- **Language** — 4-button segmented control (EN / 中文 / BM / தமிழ்), 48px high; selected is ink bg + paper text
- Acknowledgement footer: "Smarties demo · v0.4 · prototype"

---

## Interactions & Behavior
- **Routing**: hash-based (`#/home`, `#/trip/new`, `#/trip/:id`, `#/apply/:providerId`, `#/onboarding`, `#/providers`, `#/trips`, `#/profile`). Replace with your stack's router (React Navigation, Next/router, etc.).
- **Language switch** (top-right pill or profile segmented control): updates `localStorage["smarties.lang"]` and re-renders all copy live. Dictionary in `prototype/data.jsx` → `TRANSLATIONS`.
- **Onboarding**: Next button stays disabled until current question is answered; eligibility verdict is computed from all 4 answers.
- **Cost compare**: tapping Grab does nothing in the prototype (intentional — not the happy path); MET routes to `/providers`.
- **Tracker auto-advance**: stage advances every 6s up to last stage. Replace with realtime updates.
- **Bottom nav**: "Trips" tab is considered active for any of `/trip/*`, `/providers`, `/apply/*`.
- **Focus ring**: 3px gold outline at 2px offset on every interactive element. Keep it.
- **Hit targets**: every button is ≥44px tall (lg button = 56px).

---

## State Management
The prototype uses local React state + `localStorage` for language. For a real implementation:

| State | Source | Notes |
|---|---|---|
| Auth / caregiver profile | Backend session | Name, email, phone |
| Senior(s) under care | Backend, list | One→many; pick context for current trip |
| Eligibility answers + result | Backend per senior | Persist; expire annually |
| Active trip | Backend, polling or realtime | Stage, driver, ETA |
| Past trips | Backend, paginated | Show last 10 |
| Provider list for postcode | Backend, geo query | Filter by senior's home address |
| Language preference | Local + backend | Sync on login |

---

## Accessibility
- Every interactive has `focus-ring` and a visible focused state
- Toggle uses `role="switch"` + `aria-checked`
- Stepper uses `role="progressbar"` with min/max/now
- Language menu uses `role="listbox"` + `role="option"` + `aria-selected`
- All icons that are sole content have `aria-label` siblings
- Color contrast: ink-on-paper (16:1), ink-on-gold (8.5:1), green-on-greenSoft (5.4:1). Mute-on-paper (4.6:1) — fine for body, not for UI critical text
- Larger-text toggle is stubbed in profile — wire to dynamic-type / scaling in production

---

## Files in this bundle
```
design_handoff_smarties_met/
├── README.md                 (this file)
└── prototype/
    ├── index.html            (entry — Tailwind config + font imports + script tags)
    ├── data.jsx              (mock data + 4-language i18n dictionary)
    ├── ui.jsx                (icons, primitives, TopBar, BottomNav, Phone, I18n)
    ├── pages.jsx             (all 8 screens)
    └── app.jsx               (hash router shell)
```

Open `index.html` in a browser to see the prototype run. Then **don't ship that code** — recreate each screen using your codebase's components, tokens, and routing.

---

## Open questions for product
1. Real subsidy formula — is there a published rule we can lift, or do we call AIC's API per request?
2. Which providers are confirmed launch partners? Need real names + logos + service areas.
3. Payment — who collects the co-pay and when? In-app, on the trip, or invoiced monthly?
4. Family-sharing — one caregiver, many seniors, or also: many caregivers (siblings) per senior?
5. Cancellation policy + window — currently the Cancel button is unstyled-with-intent (red outline) but has no flow yet.
6. Push vs SMS — the "notify me when home safe" toggle assumes SMS. Confirm with carriers.
