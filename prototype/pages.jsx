// All page components. Globals: HomePage, OnboardingPage, TripNewPage, ProvidersPage, ApplyPage, TripTrackerPage, TripsListPage, ProfilePage

const { useState: useStateP, useEffect: useEffectP, useMemo: useMemoP, useRef: useRefP } = React;

// Backend wiring. Override at runtime by setting window.SMARTIES_BACKEND
// before this script loads. Falls back to mock auto-advance if the WS
// can't connect, so the demo still works offline.
const BACKEND_BASE =
  (typeof window !== "undefined" && window.SMARTIES_BACKEND) ||
  "http://localhost:8787";
const BACKEND_WS =
  BACKEND_BASE.replace(/^http/, "ws").replace(/\/$/, "");
const CAREGIVER_ID = "cg_weiming";

async function apiFetch(path, init) {
  const opts = init || {};
  const headers = Object.assign(
    { "X-Caregiver-Id": CAREGIVER_ID, "content-type": "application/json" },
    opts.headers || {},
  );
  const res = await fetch(`${BACKEND_BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// ───────── auth (mock Singpass) ─────────
// Session is held only in memory for the demo: every fresh page load
// destroys the JS context, so reviewers always start at the Singpass
// splash. (Real auth would persist across reloads, of course.)
let _SMARTIES_SESSION = null;
function loadSession() {
  return _SMARTIES_SESSION;
}
function saveSession(s) {
  _SMARTIES_SESSION = s;
}
function clearSession() {
  _SMARTIES_SESSION = null;
}
// Singapore-style NRIC masking: first letter + 4 X's + last 4 chars.
// "S1234567A" → "Sxxxx567A"
function maskNric(nric) {
  if (!nric || nric.length < 5) return nric || "";
  return nric[0] + "xxxx" + nric.slice(-4);
}

// ───────── booking-draft helpers (cross-screen state via localStorage) ─────────
const DRAFT_KEY = "smarties.draft";
function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveDraft(patch) {
  const next = Object.assign(loadDraft(), patch);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}
function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

// ───────── date formatters ─────────
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatTripDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function formatTripTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
// "2026-05-15T09:00" (local) → "2026-05-15T09:00:00+08:00"
function localInputToIso(local) {
  return local && local.length >= 16 ? `${local}:00+08:00` : "";
}
// "2026-05-15T09:00:00+08:00" → "2026-05-15T09:00" for datetime-local input
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Default pickup = a weekday 7-21 days out, at a realistic medical slot.
// Varied per call so multiple fake bookings during a demo don't all sit
// at the same time — the trips list looks more believable.
const SLOTS = ["08:30", "09:00", "09:30", "10:00", "10:30", "14:00", "14:30", "15:00"];
function defaultPickup() {
  const d = new Date();
  const offset = 7 + Math.floor(Math.random() * 14); // 7..20 days out
  d.setDate(d.getDate() + offset);
  // Skip weekends — most clinics don't slot weekends.
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
  const [h, m] = slot.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+08:00`;
}

// ───────── API hooks ─────────
function useApi(path, deps) {
  const [state, setState] = useStateP({ data: null, loading: true, error: null });
  const refresh = useStateP({})[1]; // refresh trigger
  useEffectP(() => {
    if (!path) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch(path)
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((error) => !cancelled && setState({ data: null, loading: false, error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line
  }, deps || [path]);
  return { ...state, refresh: () => refresh({}) };
}

/* ───────────────────────── HOME ───────────────────────── */

function HomePage() {
  const { t } = useI18n();
  const fallbackSenior = window.AppData.SENIOR;
  const { data, loading } = useApi("/api/trips");
  const meApi = useApi("/api/me");
  const seniorFromApi = meApi.data && meApi.data.seniors && meApi.data.seniors[0];
  const senior = seniorFromApi || fallbackSenior;
  const subsidyPct =
    seniorFromApi && typeof seniorFromApi.subsidy_pct === "number"
      ? seniorFromApi.subsidy_pct
      : null;
  const upcoming = (data && data.upcoming) || [];
  const fallback = window.AppData.TRIP;
  const next = upcoming[0]; // newest upcoming, or undefined

  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <div className="px-5 pt-6 pb-3">
        <p className="text-mute text-sm">{t("hm.hi")}</p>
        <h1 className="text-ink text-[26px] font-bold leading-tight">Wei Ming.</h1>
        <p className="text-mute text-sm mt-1">{t("hm.caring")} <span className="text-ink font-semibold">{senior.name}</span> · {senior.age}</p>
      </div>

      {/* Next trip */}
      <section className="px-5 mt-2">
        <h2 className="text-ink font-bold text-lg mb-2">{t("hm.next")}</h2>
        {loading && (
          <Card className="p-5">
            <div className="h-4 w-32 bg-paper2 rounded animate-pulse" />
            <div className="h-3 w-48 bg-paper2 rounded animate-pulse mt-2" />
            <div className="h-3 w-40 bg-paper2 rounded animate-pulse mt-2" />
          </Card>
        )}
        {!loading && next && (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-goldSoft text-ink inline-flex items-center justify-center">
                <Icon name="calendar" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ink font-semibold">{formatTripDate(next.pickup_at)} · {formatTripTime(next.pickup_at)}{next.is_round_trip && next.return_pickup_at ? ` → ${formatTripTime(next.return_pickup_at)}` : ""}</p>
                <p className="text-mute text-sm mt-0.5 truncate">{next.home_address} → {next.hospital_name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Pill tone={next.status === "confirmed" ? "green" : "gold"}><Icon name="check" size={12} /> {next.status === "confirmed" ? "Confirmed" : "Pending"}</Pill>
                  {next.is_round_trip ? <Pill tone="navy">{t("tk.roundTrip")}</Pill> : <Pill tone="neutral">{t("tk.oneWay")}</Pill>}
                  {typeof next.copay === "number" && <Pill tone="gold">${next.copay} co-pay</Pill>}
                </div>
              </div>
            </div>
            <Divider className="my-4" />
            <div className="flex gap-2">
              <a href={`#/trip/${next.reference}`} className="flex-1"><Btn kind="primary" size="md" className="w-full">{t("ap.view")}<Icon name="right" size={16} /></Btn></a>
            </div>
          </Card>
        )}
        {!loading && !next && (
          <Card className="p-5 text-center">
            <p className="text-mute text-sm">{t("hm.nothing")}</p>
            <a href="#/trip/new"><Btn kind="primary" size="md" className="mt-3 w-full">{t("hm.bookNew")} <Icon name="right" size={16} /></Btn></a>
          </Card>
        )}
        {!loading && data === null && fallback && !next && (
          <p className="text-mute text-xs mt-2 text-center">Showing seeded data — backend offline.</p>
        )}
      </section>

      {/* Quick actions */}
      <section className="px-5 mt-6">
        <h2 className="text-ink font-bold text-lg mb-2">{t("hm.quick")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <a href="#/trip/new" className="focus-ring rounded-2xl">
            <Card className="p-4 h-full">
              <div className="h-10 w-10 rounded-xl bg-ink text-paper inline-flex items-center justify-center"><Icon name="plus" /></div>
              <p className="font-semibold mt-3 text-ink leading-snug">{t("hm.bookNew")}</p>
            </Card>
          </a>
          {subsidyPct === null ? (
            <a href="#/profile" className="focus-ring rounded-2xl">
              <Card className="p-4 h-full">
                <div className="h-10 w-10 rounded-xl bg-goldSoft text-ink inline-flex items-center justify-center"><Icon name="spark" /></div>
                <p className="font-semibold mt-3 text-ink leading-snug">{t("hm.applyCodeQa")}</p>
              </Card>
            </a>
          ) : (
            <a href="#/profile" className="focus-ring rounded-2xl">
              <Card className="p-4 h-full">
                <div className="h-10 w-10 rounded-xl bg-greenSoft text-green inline-flex items-center justify-center"><Icon name="check" /></div>
                <p className="font-semibold mt-3 text-ink leading-snug">{t("hm.subsidyQa")}: {subsidyPct}%</p>
                <p className="text-mute text-xs mt-0.5">{t("hm.viewDetails")}</p>
              </Card>
            </a>
          )}
        </div>
      </section>

      {/* Tips */}
      <section className="px-5 mt-6 mb-8">
        <h2 className="text-ink font-bold text-lg mb-2">{t("hm.tips")}</h2>
        <Card className="divide-y divide-line">
          <div className="p-4 flex gap-3">
            <div className="h-9 w-9 rounded-lg bg-paper2 inline-flex items-center justify-center text-ink"><Icon name="doc" size={18} /></div>
            <div>
              <p className="font-semibold text-ink">{t("hm.tip1Title")}</p>
              <p className="text-mute text-sm mt-0.5">{t("hm.tip1Body")}</p>
            </div>
          </div>
          <div className="p-4 flex gap-3">
            <div className="h-9 w-9 rounded-lg bg-paper2 inline-flex items-center justify-center text-ink"><Icon name="info" size={18} /></div>
            <div>
              <p className="font-semibold text-ink">{t("hm.tip2Title")}</p>
              <p className="text-mute text-sm mt-0.5">{t("hm.tip2Body")}</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ───────────────────────── ONBOARDING ───────────────────────── */

function OnboardingPage() {
  const { t } = useI18n();
  const [step, setStep] = useStateP(0);
  const [a, setA] = useStateP({ pr: null, age: 75, mob: null, inc: null });
  const total = 4;

  const next = () => setStep((s) => Math.min(s + 1, total));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // simple eligibility model
  const verdict = useMemoP(() => {
    let elig = a.pr === "yes" && a.age >= 60;
    let subsidy = 50;
    if (a.inc === "inc1") subsidy = 80;
    else if (a.inc === "inc2") subsidy = 70;
    else if (a.inc === "inc3") subsidy = 50;
    else subsidy = 65;
    if (a.mob === "mobChair") subsidy = Math.min(85, subsidy + 5);
    const co1 = Math.round(40 * (1 - subsidy / 100));
    const co2 = Math.round(45 * (1 - subsidy / 100));
    return { elig, subsidy, co1, co2 };
  }, [a]);

  const canNext =
    (step === 0 && a.pr) ||
    (step === 1 && a.age) ||
    (step === 2 && a.mob) ||
    (step === 3 && a.inc);

  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto flex flex-col">
      <SubHeader back="#/home" />

      {/* Progress dots */}
      <div className="px-5">
        <div className="flex items-center gap-2" role="progressbar" aria-valuemin="1" aria-valuemax={total + 1} aria-valuenow={step + 1}>
          {Array.from({ length: total + 1 }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? "bg-ink flex-[2]" : "bg-line flex-1"}`} />
          ))}
        </div>
        <p className="text-mute text-xs mt-2 font-semibold tracking-wide uppercase">
          {t("ob.step")} {Math.min(step + 1, total)} {t("ob.of")} {total}
        </p>
      </div>

      <div className="flex-1 px-5 pt-6 pb-4">
        {step === 0 && (
          <QuestionLayout title={t("ob.q1Title")} sub={t("ob.q1Sub")}>
            <ChoiceList
              value={a.pr}
              options={[
                { value: "yes", label: t("ob.yes"), icon: "check" },
                { value: "no", label: t("ob.no") },
              ]}
              onChange={(v) => setA({ ...a, pr: v })}
            />
          </QuestionLayout>
        )}

        {step === 1 && (
          <QuestionLayout title={t("ob.q2Title")} sub={t("ob.q2Sub")}>
            <div className="bg-white border border-line rounded-2xl p-6 flex items-center justify-between">
              <button
                aria-label="Decrease age"
                onClick={() => setA({ ...a, age: Math.max(40, a.age - 1) })}
                className="focus-ring h-14 w-14 rounded-full bg-paper2 text-ink text-2xl font-bold inline-flex items-center justify-center"
              >−</button>
              <div className="text-center">
                <p className="text-[64px] font-bold leading-none text-ink tracking-tight">{a.age}</p>
                <p className="text-mute text-sm mt-1">{t("ob.years")}</p>
              </div>
              <button
                aria-label="Increase age"
                onClick={() => setA({ ...a, age: Math.min(110, a.age + 1) })}
                className="focus-ring h-14 w-14 rounded-full bg-paper2 text-ink text-2xl font-bold inline-flex items-center justify-center"
              >+</button>
            </div>
          </QuestionLayout>
        )}

        {step === 2 && (
          <QuestionLayout title={t("ob.q3Title")} sub={t("ob.q3Sub")}>
            <ChoiceList
              value={a.mob}
              options={[
                { value: "mobIndep", label: t("ob.mobIndep"), icon: "spark" },
                { value: "mobHelp", label: t("ob.mobHelp"), icon: "shield" },
                { value: "mobChair", label: t("ob.mobChair"), icon: "wheelchair" },
              ]}
              onChange={(v) => setA({ ...a, mob: v })}
            />
          </QuestionLayout>
        )}

        {step === 3 && (
          <QuestionLayout title={t("ob.q4Title")} sub={t("ob.q4Sub")}>
            <ChoiceList
              value={a.inc}
              options={[
                { value: "inc1", label: t("ob.inc1") },
                { value: "inc2", label: t("ob.inc2") },
                { value: "inc3", label: t("ob.inc3") },
                { value: "inc4", label: t("ob.inc4") },
              ]}
              onChange={(v) => setA({ ...a, inc: v })}
            />
          </QuestionLayout>
        )}

        {step === 4 && (
          <div className="page-anim">
            <div className="text-center pt-2">
              <div className="mx-auto h-16 w-16 rounded-full bg-greenSoft text-green inline-flex items-center justify-center">
                <Icon name="check" size={36} />
              </div>
              <h2 className="mt-5 text-[26px] font-bold text-ink">{t("ob.verdictTitle")}</h2>
              <p className="text-mute mt-1 max-w-[460px] mx-auto">
                Your loved one looks eligible for a subsidised MET trip. To activate it, apply the signed code issued by your polyclinic, hospital MSW or social service agency.
              </p>
            </div>
            <Card className="mt-6 p-5">
              <p className="text-ink font-semibold flex items-center gap-2">
                <Icon name="spark" size={18} /> Got a subsidy code?
              </p>
              <p className="text-mute text-sm mt-1.5 leading-snug">
                Paste it into your Profile to start saving on every MET trip.
              </p>
              <a href="#/profile" className="block mt-4">
                <Btn kind="primary" className="w-full">Apply subsidy code <Icon name="right" size={18} /></Btn>
              </a>
              <a href="#/trip/new" className="block mt-2">
                <Btn kind="outline" className="w-full">Skip — book a trip first</Btn>
              </a>
            </Card>
          </div>
        )}
      </div>

      {/* Footer nav */}
      {step < total && (
        <div className="sticky bottom-0 bg-paper border-t border-line p-4 flex gap-3">
          {step > 0 ? (
            <Btn kind="outline" onClick={back} className="flex-1"><Icon name="back" size={18} />{t("ob.back")}</Btn>
          ) : (
            <a href="#/home" className="flex-1"><Btn kind="outline" className="w-full">{t("ob.back")}</Btn></a>
          )}
          <Btn kind="primary" onClick={next} disabled={!canNext} className={`flex-[2] ${!canNext ? "opacity-40 pointer-events-none" : ""}`}>
            {t("ob.next")} <Icon name="right" size={18} />
          </Btn>
        </div>
      )}
    </div>
  );
}

function QuestionLayout({ title, sub, children }) {
  return (
    <div>
      <h2 className="text-[26px] font-bold text-ink leading-snug">{title}</h2>
      <p className="text-mute mt-2">{sub}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ChoiceList({ value, options, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={sel}
            className={`focus-ring w-full min-h-[64px] px-5 rounded-2xl border text-left flex items-center gap-3 transition ${sel ? "border-gold bg-goldSoft/40 ring-2 ring-gold" : "border-line bg-white hover:border-ink/30"}`}
          >
            {o.icon && <span className={`h-9 w-9 rounded-lg inline-flex items-center justify-center ${sel ? "bg-gold text-ink" : "bg-paper2 text-ink"}`}><Icon name={o.icon} size={18} /></span>}
            <span className="font-semibold text-ink text-[17px]">{o.label}</span>
            <span className="ml-auto h-6 w-6 rounded-full border-2 inline-flex items-center justify-center" style={{ borderColor: sel ? "#0B2545" : "#E4DCCC", background: sel ? "#0B2545" : "transparent" }}>
              {sel && <Icon name="check" size={14} className="text-paper" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── TRIP NEW (cost compare) ───────────────────────── */

const COMMON_HOSPITALS = [
  { name: "Singapore General Hospital", address: "Outram Rd, Singapore 169608" },
  { name: "Khoo Teck Puat Hospital", address: "90 Yishun Central, Singapore 768828" },
  { name: "AMK Polyclinic", address: "21 Ang Mo Kio Central 2, Singapore 569666" },
  { name: "Tan Tock Seng Hospital", address: "11 Jalan Tan Tock Seng, Singapore 308433" },
  { name: "National Heart Centre", address: "5 Hospital Dr, Singapore 169609" },
];

function TripNewPage() {
  const { t } = useI18n();
  const trip = window.AppData.TRIP; // fallback for cost numbers only
  const senior = window.AppData.SENIOR;
  const meApi = useApi("/api/me");
  const seniorFromApi = meApi.data && meApi.data.seniors && meApi.data.seniors[0];
  const hasSubsidy =
    seniorFromApi && typeof seniorFromApi.subsidy_pct === "number";
  const initialDraft = useMemoP(() => loadDraft(), []);

  const [hospital, setHospital] = useStateP(
    initialDraft.hospitalName || COMMON_HOSPITALS[0].name,
  );
  const [hospitalAddress, setHospitalAddress] = useStateP(
    initialDraft.hospitalAddress || COMMON_HOSPITALS[0].address,
  );
  const [pickupLocal, setPickupLocal] = useStateP(
    initialDraft.pickupAt
      ? isoToLocalInput(initialDraft.pickupAt)
      : isoToLocalInput(defaultPickup()),
  );
  // Default to round-trip — almost every senior medical journey needs a
  // return ride, and MET providers price per round trip anyway.
  const [roundTrip, setRoundTrip] = useStateP(
    initialDraft.roundTrip !== false,
  );
  const [returnLocal, setReturnLocal] = useStateP(() => {
    if (initialDraft.returnAt) return isoToLocalInput(initialDraft.returnAt);
    const base = initialDraft.pickupAt || defaultPickup();
    return isoToLocalInput(
      new Date(new Date(base).getTime() + 2 * 60 * 60_000).toISOString(),
    );
  });

  // Round-trip prices (round-trip is the default, halve for one-way).
  const roundMetLow = hasSubsidy ? seniorFromApi.copay_low : 40;
  const roundMetHigh = hasSubsidy ? seniorFromApi.copay_high : 45;
  const metLow = roundTrip ? roundMetLow : Math.round(roundMetLow * 0.6);
  const metHigh = roundTrip ? roundMetHigh : Math.round(roundMetHigh * 0.6);
  const grabLowDisplay = roundTrip ? 70 : 35;
  const grabHighDisplay = roundTrip ? 80 : 40;

  const home = senior.home || trip.home || "234 Ang Mo Kio Ave 3";

  // When the pickup time moves, shift the return time by the same delta
  // so the caregiver's chosen offset (e.g. 2h consultation) is preserved.
  // Editing the return time directly doesn't trigger this.
  const prevPickupRef = useRefP(pickupLocal);
  useEffectP(() => {
    const prevIso = localInputToIso(prevPickupRef.current);
    const newIso = localInputToIso(pickupLocal);
    if (prevIso && newIso && prevIso !== newIso) {
      const delta = new Date(newIso).getTime() - new Date(prevIso).getTime();
      const returnIso = localInputToIso(returnLocal);
      if (returnIso) {
        const shifted = new Date(new Date(returnIso).getTime() + delta).toISOString();
        setReturnLocal(isoToLocalInput(shifted));
      }
    }
    prevPickupRef.current = pickupLocal;
  }, [pickupLocal]);

  // Safety net: if return is somehow before/equal to pickup (e.g. a stale
  // draft), bump it to pickup + 2h.
  useEffectP(() => {
    const pickupIso = localInputToIso(pickupLocal);
    const returnIso = localInputToIso(returnLocal);
    if (pickupIso && returnIso && new Date(returnIso) <= new Date(pickupIso)) {
      setReturnLocal(
        isoToLocalInput(
          new Date(new Date(pickupIso).getTime() + 2 * 60 * 60_000).toISOString(),
        ),
      );
    }
  }, [pickupLocal, returnLocal]);

  // Persist any change to the draft so the next screen sees the latest.
  useEffectP(() => {
    saveDraft({
      seniorId: "sn_madamlim",
      hospitalName: hospital,
      hospitalAddress,
      pickupAt: localInputToIso(pickupLocal),
      roundTrip,
      returnAt: roundTrip ? localInputToIso(returnLocal) : null,
    });
  }, [hospital, hospitalAddress, pickupLocal, roundTrip, returnLocal]);

  const onPickHospital = (h) => {
    setHospital(h.name);
    setHospitalAddress(h.address);
  };

  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <SubHeader back="#/home" title={t("tn.title")} />
      <p className="px-5 -mt-1 text-mute text-sm">{t("tn.subtitle")}</p>

      {/* Trip details (editable) */}
      <div className="px-5 mt-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-mute text-xs font-semibold uppercase tracking-wide">{t("tn.detailsTitle")}</p>
          </div>
          <div className="mt-3 space-y-3">
            <RouteRow icon="pin" label={t("tn.home")} value={home} />
            <div className="ml-[18px] h-5 border-l-2 border-dashed border-line" />

            {/* Hospital input */}
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-lg bg-ink text-paper inline-flex items-center justify-center shrink-0">
                <Icon name="pin" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <label className="text-mute text-xs font-semibold uppercase tracking-wide">{t("tn.hospital")}</label>
                <input
                  type="text"
                  value={hospital}
                  onChange={(e) => setHospital(e.target.value)}
                  className="focus-ring mt-1 w-full bg-paper2/60 border border-line rounded-lg px-3 py-2 text-ink font-semibold text-[15px]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COMMON_HOSPITALS.map((h) => (
                    <button
                      key={h.name}
                      onClick={() => onPickHospital(h)}
                      className={`focus-ring text-[11px] px-2.5 py-1 rounded-full font-semibold border transition ${hospital === h.name ? "bg-ink text-paper border-ink" : "bg-paper2/40 text-mute border-line hover:border-ink/30"}`}
                    >
                      {h.name.replace("Singapore ", "").replace(" Hospital", "").replace(" Polyclinic", " PC").slice(0, 24)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Divider className="my-1" />

            {/* Pickup datetime input */}
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-lg bg-paper2 text-ink inline-flex items-center justify-center shrink-0">
                <Icon name="clock" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <label className="text-mute text-xs font-semibold uppercase tracking-wide">{t("tn.when")}</label>
                <input
                  type="datetime-local"
                  value={pickupLocal}
                  onChange={(e) => setPickupLocal(e.target.value)}
                  className="focus-ring mt-1 w-full bg-paper2/60 border border-line rounded-lg px-3 py-2 text-ink font-semibold text-[15px] tabular-nums"
                />
                {pickupLocal && (
                  <p className="text-mute text-xs mt-1">
                    {formatTripDate(localInputToIso(pickupLocal))} · {formatTripTime(localInputToIso(pickupLocal))}
                  </p>
                )}
              </div>
            </div>

            <Divider className="my-1" />

            {/* Round-trip toggle + return time */}
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-lg bg-paper2 text-ink inline-flex items-center justify-center shrink-0">
                <Icon name="van" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-mute text-xs font-semibold uppercase tracking-wide">Trip type</p>
                  <button
                    role="switch"
                    aria-checked={roundTrip}
                    onClick={() => setRoundTrip((r) => !r)}
                    className={`focus-ring shrink-0 h-7 w-12 rounded-full transition relative ${roundTrip ? "bg-green" : "bg-line"}`}
                  >
                    <span className={`absolute top-1 ${roundTrip ? "right-1" : "left-1"} h-5 w-5 rounded-full bg-white shadow transition-all`} />
                  </button>
                </div>
                <p className="text-ink font-semibold text-[15px] mt-1">
                  {roundTrip ? t("tk.roundTrip") : t("tk.oneWay")}
                </p>
                {roundTrip && (
                  <div className="mt-2">
                    <label className="text-mute text-[11px] font-semibold uppercase tracking-wide">
                      {t("tk.returnTime")}
                    </label>
                    <input
                      type="datetime-local"
                      value={returnLocal}
                      onChange={(e) => setReturnLocal(e.target.value)}
                      className="focus-ring mt-1 w-full bg-paper2/60 border border-line rounded-lg px-3 py-2 text-ink font-semibold text-[15px] tabular-nums"
                    />
                    {returnLocal && (
                      <p className="text-mute text-xs mt-1">
                        {formatTripTime(localInputToIso(returnLocal))} · {t("tk.returnHomeBy")} ~{formatTripTime(new Date(new Date(localInputToIso(returnLocal)).getTime() + 35 * 60_000).toISOString())}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Cost compare */}
      <div className="px-5 mt-5">
        <p className="text-ink font-bold text-sm uppercase tracking-wider mb-3">{t("tn.compareTitle")}</p>
        <div className="grid grid-cols-2 gap-3">
          {/* Grab card */}
          <div className="rounded-2xl border border-line bg-paper2/50 p-4 flex flex-col">
            <div className="flex items-center justify-between">
              <p className="text-mute font-semibold text-sm">{t("tn.grabHead")}</p>
              <Icon name="car" size={18} className="text-mute" />
            </div>
            <p className="mt-4 text-mute text-[28px] font-bold leading-none">≈ ${grabLowDisplay}–${grabHighDisplay}</p>
            <ul className="mt-4 space-y-1.5 text-mute text-[13px] leading-snug flex-1">
              {t("tn.grabBullets").map((b, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-mute">•</span><span>{b}</span></li>
              ))}
            </ul>
            <Btn kind="outline" size="md" className="mt-4 w-full !text-mute !border-mute/30">{t("tn.grabBtn")}</Btn>
          </div>

          {/* MET card */}
          <div className="relative rounded-2xl border-2 border-gold bg-white p-4 flex flex-col shadow-lift">
            {hasSubsidy && (
              <div className="absolute -top-2.5 right-3"><Pill tone="gold"><Icon name="spark" size={12} /> {t("tn.metBadge")}</Pill></div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-ink font-semibold text-sm">{hasSubsidy ? t("tn.metHead") : "MET"}</p>
              <Icon name="van" size={18} className="text-ink" />
            </div>
            <div className="mt-3">
              {hasSubsidy && (
                <p className="text-mute text-[15px] font-semibold line-through">${roundTrip ? 40 : 24}</p>
              )}
              <p className="text-ink text-[64px] font-bold leading-none tracking-tight">
                ${metLow}{metHigh !== metLow ? `–${metHigh}` : ""}
              </p>
              {!hasSubsidy && (
                <p className="text-mute text-xs mt-1">{t("tn.applyCodeHint")}</p>
              )}
            </div>
            <ul className="mt-4 space-y-1.5 text-ink text-[13px] leading-snug flex-1">
              {t("tn.metBullets").map((b, i) => (
                <li key={i} className="flex gap-1.5"><Icon name="check" size={14} className="text-green mt-0.5 shrink-0" /><span>{b}</span></li>
              ))}
            </ul>
            <a href="#/providers"><Btn kind="primary" size="md" className="mt-4 w-full">{t("tn.metBtn")} <Icon name="right" size={16} /></Btn></a>
          </div>
        </div>
      </div>

      <div className="px-5 mt-5 mb-8">
        <Card className="p-4">
          <p className="text-ink font-semibold text-sm flex items-center gap-2"><Icon name="info" size={16} /> {t("tn.whyMET")}</p>
          <p className="text-mute text-sm mt-1.5 leading-relaxed">{t("tn.whyMETBody")}</p>
        </Card>
      </div>
    </div>
  );
}

function RouteRow({ icon, label, value, accent }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0 ${accent ? "bg-ink text-paper" : "bg-paper2 text-ink"}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-mute text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-ink font-semibold text-[15px] truncate">{value}</p>
      </div>
    </div>
  );
}

/* ───────────────────────── PROVIDERS ───────────────────────── */

function ProvidersPage() {
  const { t } = useI18n();
  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <SubHeader back="#/trip/new" title={t("pv.title")} />
      <p className="px-5 -mt-1 text-mute text-sm">{t("pv.subtitle")}</p>
      <div className="px-5 mt-4 flex flex-col gap-3 pb-6">
        {window.AppData.PROVIDERS.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-xl inline-flex items-center justify-center font-bold text-xl shrink-0" style={{ background: p.bg, color: p.fg }}>{p.initials}</div>
              <div className="flex-1 min-w-0">
                <p className="text-ink font-bold text-[17px] leading-tight">{p.name}</p>
                <p className="text-mute text-xs mt-1">{p.serves}</p>
                <Pill tone="green" className="mt-2"><Icon name="pin" size={11} /> {t("pv.serves")}</Pill>
              </div>
            </div>
            <p className="text-mute text-sm mt-3 leading-relaxed">{p.note}</p>
            <Divider className="my-4" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-mute text-[11px] font-semibold uppercase tracking-wide">{t("pv.coPay")}</p>
                <p className="text-ink font-bold text-xl">{p.coPay}</p>
              </div>
              <div>
                <p className="text-mute text-[11px] font-semibold uppercase tracking-wide">{t("pv.response")}</p>
                <p className="text-ink font-bold text-xl">{p.response}</p>
              </div>
              <a href={`#/apply/${p.id}`} className="ml-auto" onClick={() => saveDraft({ providerId: p.id })}><Btn kind="primary" size="md">{t("pv.choose")} <Icon name="right" size={16} /></Btn></a>
            </div>
          </Card>
        ))}
        <p className="text-mute text-center text-xs mt-2">{t("pv.foot")}</p>
      </div>
    </div>
  );
}

/* ───────────────────────── APPLY ───────────────────────── */

function ApplyPage({ providerId }) {
  const { t } = useI18n();
  const provider =
    window.AppData.PROVIDERS.find((p) => p.id === providerId) || window.AppData.PROVIDERS[0];

  const [state, setState] = useStateP({ phase: "submitting", trip: null, error: null });

  // POST the booking once on mount. The Providers screen has saved the
  // selected provider into the draft; we read seniorId / hospital / pickup
  // from there too. On failure we degrade to a fake reference so the demo
  // can still continue without a backend.
  useEffectP(() => {
    let cancelled = false;
    const draft = loadDraft();
    const body = {
      seniorId: draft.seniorId || "sn_madamlim",
      providerId: providerId || draft.providerId || "touch",
      hospitalName: draft.hospitalName || "Singapore General Hospital",
      hospitalAddress: draft.hospitalAddress || null,
      pickupAt: draft.pickupAt || defaultPickup(),
      roundTrip: draft.roundTrip !== false,
      returnAt: draft.returnAt || null,
    };
    apiFetch("/api/trips", { method: "POST", body: JSON.stringify(body) })
      .then((res) => {
        if (cancelled) return;
        clearDraft();
        setState({
          phase: "ok",
          trip: {
            id: res.trip.id,
            reference: res.trip.reference,
            hospitalName: body.hospitalName,
            hospitalAddress: body.hospitalAddress,
            pickupAt: body.pickupAt,
            providerName: res.provider ? res.provider.name : provider.name,
          },
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        // Offline fallback: synthesise a believable-looking reference so the
        // demo flow doesn't dead-end. Tracker page will fall back to mock.
        const ref =
          "MET-" + Math.random().toString(16).slice(2, 8).toUpperCase();
        clearDraft();
        setState({
          phase: "ok-offline",
          trip: {
            id: ref,
            reference: ref,
            hospitalName: body.hospitalName,
            hospitalAddress: body.hospitalAddress,
            pickupAt: body.pickupAt,
            providerName: provider.name,
          },
          error: err.message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  if (state.phase === "submitting") {
    return (
      <div className="page-anim flex-1 phone-scroll overflow-y-auto">
        <div className="px-5 pt-16 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-goldSoft text-ink inline-flex items-center justify-center">
            <span className="h-10 w-10 rounded-full border-[3px] border-ink/20 border-t-ink animate-spin" />
          </div>
          <p className="mt-5 text-ink text-[19px] font-semibold">Sending your request to {provider.name}…</p>
          <p className="mt-2 text-mute text-sm">This usually takes a couple of seconds.</p>
        </div>
      </div>
    );
  }

  const tk = state.trip;
  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <div className="px-5 pt-10 text-center">
        <div className="mx-auto h-20 w-20 rounded-full bg-greenSoft text-green inline-flex items-center justify-center">
          <Icon name="check" size={44} />
        </div>
        <p className="mt-5 text-mute text-sm font-semibold">{t("ap.sentTo")}</p>
        <h1 className="mt-1 text-ink text-[28px] font-bold leading-tight">{tk.providerName}</h1>
        <p className="mt-3 text-mute leading-relaxed max-w-[480px] mx-auto">{t("ap.reassure")}</p>
        {state.phase === "ok-offline" && (
          <p className="mt-3 text-mute text-xs">Backend unreachable — showing local confirmation.</p>
        )}
      </div>

      <div className="px-5 mt-7">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-mute text-xs font-semibold uppercase tracking-wide">{t("ap.ref")}</p>
            <span className="text-ink font-mono font-bold tracking-wider">{tk.reference}</span>
          </div>
          <Divider className="my-4" />
          <div className="space-y-3">
            <RouteRow icon="pin" label={t("tn.home")} value={window.AppData.SENIOR.home || window.AppData.TRIP.home} />
            <RouteRow icon="pin" label={t("tn.hospital")} value={tk.hospitalName} accent />
            <RouteRow icon="clock" label={t("tn.when")} value={`${formatTripDate(tk.pickupAt)} · ${formatTripTime(tk.pickupAt)}`} />
          </div>
        </Card>
      </div>

      <div className="px-5 mt-5">
        <h2 className="text-ink font-bold text-lg mb-2">{t("ap.whatNext")}</h2>
        <Card>
          {[t("ap.n1"), t("ap.n2"), t("ap.n3")].map((n, i) => (
            <div key={i} className={`p-4 flex items-center gap-3 ${i < 2 ? "border-b border-line" : ""}`}>
              <span className="h-7 w-7 rounded-full bg-ink text-paper inline-flex items-center justify-center text-xs font-bold">{i + 1}</span>
              <p className="text-ink text-[15px]">{n}</p>
            </div>
          ))}
        </Card>
      </div>

      <div className="px-5 mt-6 mb-8 flex gap-3">
        <a href={`#/trip/${tk.reference}`} className="flex-1"><Btn kind="primary" className="w-full">{t("ap.view")} <Icon name="right" size={18} /></Btn></a>
      </div>
    </div>
  );
}

/* ───────────────────────── TRIP TRACKER ───────────────────────── */

function TripTrackerPage({ tripId }) {
  const { t } = useI18n();
  const fallback = window.AppData.TRIP;
  const allStages = t("tk.stages");
  const ref = tripId || fallback.id;

  // Fetch the full trip from backend so the driver, escort, ETA, and route
  // all reflect the real booking. Falls back to the seeded mock if backend
  // is unreachable.
  const { data: tripPayload } = useApi(`/api/trips/${encodeURIComponent(ref)}`, [ref]);
  const tripData = tripPayload && tripPayload.trip;
  const isFinal =
    tripData && (tripData.status === "completed" || tripData.status === "cancelled");
  const tripStatusLabel = !tripData
    ? null
    : tripData.status === "cancelled"
      ? "Cancelled"
      : tripData.status === "completed"
        ? "Completed"
        : null;
  const trip = tripData
    ? {
        id: tripData.reference,
        ref: tripData.reference,
        home: tripData.home_address || fallback.home,
        hospital: tripData.hospital_name || fallback.hospital,
        date: formatTripDate(tripData.pickup_at) || fallback.date,
        time: formatTripTime(tripData.pickup_at) || fallback.time,
        arr: formatTripTime(tripData.arrives_at) || fallback.arr,
        isRoundTrip: tripData.is_round_trip === 1,
        returnTime: formatTripTime(tripData.return_pickup_at),
        returnArr: formatTripTime(tripData.return_arrives_at),
        driver: tripData.driver_name
          ? {
              name: tripData.driver_name,
              vehicle: `${tripData.driver_vehicle ?? ""}${tripData.driver_plate ? " · " + tripData.driver_plate : ""}`,
            }
          : null,
        escort: tripData.escort_name ? { name: tripData.escort_name } : null,
        copay: typeof tripData.copay === "number" ? tripData.copay : fallback.metPrice,
      }
    : fallback;
  // Render the appropriate slice of stages: 6 for one-way, 9 for round trip.
  const stages = trip.isRoundTrip ? allStages : allStages.slice(0, 6);

  const [active, setActive] = useStateP(2); // driver assigned
  const [notify, setNotify] = useStateP(true);
  const [cancelled, setCancelled] = useStateP(false);
  const [conn, setConn] = useStateP("connecting"); // connecting | live | offline

  // Live stage feed: subscribe to /api/trips/:ref/live. Skipped entirely
  // for completed/cancelled trips (they're not progressing). If the
  // connection can't be established (backend offline / blocked), we fall
  // back to the 6-second auto-advance so the demo still progresses.
  useEffectP(() => {
    if (isFinal) {
      // Snap stepper to its final state and don't subscribe.
      setActive(tripData.stage ?? stages.length - 1);
      setConn("done");
      return;
    }
    let socket = null;
    let fallbackTimer = null;
    let cancelled = false;
    const startFallback = () => {
      if (fallbackTimer) return;
      setConn("offline");
      fallbackTimer = setInterval(
        () => setActive((a) => Math.min(a + 1, stages.length - 1)),
        6000,
      );
    };
    try {
      socket = new WebSocket(
        `${BACKEND_WS}/api/trips/${encodeURIComponent(ref)}/live?caregiverId=${CAREGIVER_ID}`,
      );
      socket.onopen = () => {
        if (cancelled) return;
        setConn("live");
      };
      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.state && typeof msg.state.stage === "number") {
            setActive(Math.min(msg.state.stage, stages.length - 1));
          }
        } catch {}
      };
      socket.onerror = startFallback;
      socket.onclose = startFallback;
    } catch {
      startFallback();
    }
    return () => {
      cancelled = true;
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (socket && socket.readyState <= 1) socket.close();
    };
  }, [ref, stages.length, isFinal, tripData && tripData.stage]);

  // Persist the notify preference. Optimistic UI; revert on failure.
  const onToggleNotify = async () => {
    const next = !notify;
    setNotify(next);
    try {
      await apiFetch(`/api/trips/${encodeURIComponent(ref)}/notify`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: next }),
      });
    } catch {
      setNotify(!next);
    }
  };

  const onCancelTrip = async () => {
    const ok = window.confirm(
      "Cancel this trip? The provider will be notified and any subsidy hold released.",
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/trips/${encodeURIComponent(ref)}/cancel`, {
        method: "POST",
      });
      setCancelled(true);
    } catch (e) {
      window.alert("Could not cancel — please try again or call the provider directly.");
    }
  };

  const headerLabel = cancelled || isFinal ? tripStatusLabel || t("tk.cancel") : stages[active];
  const etaLabel = isFinal && tripData && tripData.status === "completed" ? "Completed" : t("tk.eta");

  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <SubHeader back="#/home" title={isFinal ? "Trip summary" : t("tk.title")} />

      {/* Status header card */}
      <div className="px-5 mt-1">
        <div className="rounded-2xl bg-ink text-paper p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-paper/70 text-xs font-semibold uppercase tracking-wide">{etaLabel}</p>
              <p className="text-paper text-[44px] font-bold leading-none mt-1 tracking-tight">{trip.arr}</p>
              <p className="text-paper/70 text-xs mt-1">{trip.date}</p>
            </div>
            <div className="text-right">
              <Pill tone={isFinal && tripData.status === "cancelled" ? "neutral" : "gold"} className={isFinal && tripData.status === "cancelled" ? "!bg-danger/20 !text-danger" : "!bg-gold !text-ink"}>{headerLabel}</Pill>
              <p className="text-paper/70 text-xs mt-2">Ref · {ref}</p>
              {active >= 2 && !isFinal && (
                <p className="text-paper/60 text-[10px] mt-1 inline-flex items-center gap-1 font-semibold uppercase tracking-wide">
                  <span className={`h-1.5 w-1.5 rounded-full ${conn === "live" ? "bg-green animate-pulse" : conn === "connecting" ? "bg-gold" : "bg-mute"}`} />
                  {conn === "live" ? "Live" : conn === "connecting" ? "Connecting" : "Offline (sim)"}
                </p>
              )}
            </div>
          </div>
          {trip.isRoundTrip && (
            <div className="mt-4 pt-4 border-t border-paper/10 grid grid-cols-2 gap-4 text-[12px]">
              <div>
                <p className="text-paper/60 font-semibold uppercase tracking-wider">{t("tk.outbound")}</p>
                <p className="text-paper font-semibold mt-0.5">{trip.time}</p>
              </div>
              <div>
                <p className="text-paper/60 font-semibold uppercase tracking-wider">{t("tk.returnLeg")}</p>
                <p className="text-paper font-semibold mt-0.5">{trip.returnTime || "—"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Driver card (shown when assigned) */}
      {active >= 2 && trip.driver && (
        <div className="px-5 mt-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-paper2 text-ink inline-flex items-center justify-center font-bold">{trip.driver.name.split(" ").map(s=>s[0]).join("")}</div>
            <div className="flex-1 min-w-0">
              <p className="text-mute text-xs font-semibold uppercase tracking-wide">{t("tk.driver")}{trip.escort ? ` · ${t("tk.escort")}` : ""}</p>
              <p className="text-ink font-semibold text-[15px]">{trip.driver.name}{trip.escort ? ` · ${trip.escort.name}` : ""}</p>
              <p className="text-mute text-xs mt-0.5 truncate">{trip.driver.vehicle}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Stepper */}
      <div className="px-5 mt-5">
        <Card className="p-5">
          {stages.map((s, i) => {
            const isDone = i < active;
            const isActive = i === active;
            const isLast = i === stages.length - 1;
            return (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-9 w-9 rounded-full inline-flex items-center justify-center text-xs font-bold transition ${
                      isDone ? "bg-green text-white" :
                      isActive ? "bg-gold text-ink ring-4 ring-gold/25 pulse-gold" :
                      "bg-paper2 text-mute border border-line"
                    }`}
                  >
                    {isDone ? <Icon name="check" size={16} /> : i + 1}
                  </div>
                  {!isLast && <div className={`w-0.5 flex-1 my-1 step-line ${isDone ? "done" : isActive ? "active" : ""}`} />}
                </div>
                <div className={`pb-5 ${isLast ? "" : ""}`}>
                  <p className={`font-semibold text-[15px] ${isActive ? "text-ink" : isDone ? "text-ink" : "text-mute"}`}>{s}</p>
                  {isActive && <p className="text-mute text-xs mt-0.5">In progress…</p>}
                  {isDone && <p className="text-mute text-xs mt-0.5">Completed</p>}
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Live map */}
      <div className="px-5 mt-5">
        <TripMap active={active} placeholderText={t("tk.mapPlaceholder")} hospital={trip.hospital} />
      </div>

      {/* Notify toggle */}
      <div className="px-5 mt-5 mb-8">
        <Card className="p-4 flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-goldSoft text-ink inline-flex items-center justify-center"><Icon name="bell" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-ink font-semibold">{t("tk.notify")}</p>
            <p className="text-mute text-xs mt-0.5">{t("tk.notifySub")}</p>
          </div>
          <button
            role="switch"
            aria-checked={notify}
            onClick={onToggleNotify}
            className={`focus-ring shrink-0 h-8 w-14 rounded-full transition relative ${notify ? "bg-green" : "bg-line"}`}
          >
            <span className={`absolute top-1 ${notify ? "right-1" : "left-1"} h-6 w-6 rounded-full bg-white shadow transition-all`} />
          </button>
        </Card>

        {!isFinal && (
          <div className="mt-3 flex gap-3">
            <Btn kind="danger" className="flex-1" onClick={onCancelTrip} disabled={cancelled}>
              {cancelled ? "Trip cancelled" : t("tk.cancel")}
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── TRIP MAP (real basemap, sim driver) ───────────────────────── */

// Pickup origin + provider depot for the seeded caregiver. Real-world
// data would come from the senior's address; we keep AMK Ave 3 fixed
// for the demo since that's where Madam Lim lives.
const MAP_HOME     = [1.3717, 103.8443];
const MAP_DEPOT    = [1.3691, 103.8492];

// Hospital lat/lng + short-label dictionary. Falls back to SGH for any
// hospital we don't recognise.
const HOSPITAL_COORDS = {
  "Singapore General Hospital": { coords: [1.2786, 103.8358], label: "SGH" },
  "Khoo Teck Puat Hospital":    { coords: [1.4242, 103.8388], label: "KTPH" },
  "AMK Polyclinic":              { coords: [1.3756, 103.8447], label: "AMK PC" },
  "Tan Tock Seng Hospital":     { coords: [1.3216, 103.8460], label: "TTSH" },
  "National Heart Centre":      { coords: [1.2783, 103.8344], label: "NHC" },
};
const DEFAULT_HOSPITAL = HOSPITAL_COORDS["Singapore General Hospital"];

function hospitalInfo(name) {
  if (!name) return DEFAULT_HOSPITAL;
  if (HOSPITAL_COORDS[name]) return HOSPITAL_COORDS[name];
  // Soft match — handle minor name variations like "Singapore General Hospital (SGH)"
  const key = Object.keys(HOSPITAL_COORDS).find(
    (k) => name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(name.toLowerCase()),
  );
  return key ? HOSPITAL_COORDS[key] : { coords: DEFAULT_HOSPITAL.coords, label: name.split(" ").slice(0, 2).join(" ") };
}

// Map of stage -> position along route.
//   stage 2 (Driver assigned)   : depot
//   stage 3 (En route to pickup): mostly to home
//   stage 4 (Senior boarded)    : at home, just departed
//   stage 5 (Arrived at hospital): at hospital
function driverTargetForStage(stage, hospitalCoords) {
  if (stage <= 2) return MAP_DEPOT;
  if (stage === 3) return lerpLatLng(MAP_DEPOT, MAP_HOME, 0.85);
  if (stage === 4) return MAP_HOME;
  return hospitalCoords;
}
function lerpLatLng(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function TripMap({ active, placeholderText, hospital }) {
  const containerRef = useRefP(null);
  const mapRef = useRefP(null);
  const driverRef = useRefP(null);
  const hospitalLayerRef = useRefP(null);
  const routeLayerRef = useRefP(null);
  const animRef = useRefP(null);

  const { coords: hospitalCoords, label: hospitalLabel } = useMemoP(
    () => hospitalInfo(hospital),
    [hospital],
  );

  // One-time map init (basemap + home marker + driver marker).
  useEffectP(() => {
    if (!containerRef.current || mapRef.current) return;
    if (typeof window.L === "undefined") return;

    const L = window.L;
    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: false,
      dragging: true,
      tap: false,
    });
    mapRef.current = map;

    L.tileLayer("https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png", {
      maxZoom: 19,
      minZoom: 11,
    }).addTo(map);

    L.control
      .attribution({ position: "bottomleft", prefix: "" })
      .addAttribution(
        '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener" style="color:#5B6B82;font-size:10px;">OneMap</a> &copy; <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener" style="color:#5B6B82;font-size:10px;">SLA</a>',
      )
      .addTo(map);

    const homeIcon = L.divIcon({
      className: "smarties-pin",
      html: '<span class="smarties-pin-home">🏠 Home</span>',
      iconSize: [80, 24],
      iconAnchor: [12, 12],
    });
    const driverIcon = L.divIcon({
      className: "smarties-pin",
      html: '<div class="smarties-pin-driver">🚐</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    L.marker(MAP_HOME, { icon: homeIcon }).addTo(map);

    const driver = L.marker(MAP_DEPOT, {
      icon: driverIcon,
      opacity: 0,
      keyboard: false,
    }).addTo(map);
    driverRef.current = driver;

    setTimeout(() => map.invalidateSize(), 50);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      driverRef.current = null;
      hospitalLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  // Hospital marker + route polyline rebuild whenever the hospital changes.
  useEffectP(() => {
    const map = mapRef.current;
    if (!map || typeof window.L === "undefined") return;
    const L = window.L;

    if (hospitalLayerRef.current) map.removeLayer(hospitalLayerRef.current);
    if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);

    const hospitalIcon = L.divIcon({
      className: "smarties-pin",
      html: `<span class="smarties-pin-hospital">🏥 ${hospitalLabel}</span>`,
      iconSize: [80, 24],
      iconAnchor: [12, 12],
    });
    hospitalLayerRef.current = L.marker(hospitalCoords, { icon: hospitalIcon }).addTo(map);

    routeLayerRef.current = L.polyline([MAP_DEPOT, MAP_HOME, hospitalCoords], {
      color: "#0B2545",
      weight: 3,
      dashArray: "6 6",
      opacity: 0.55,
    }).addTo(map);

    map.fitBounds(L.latLngBounds([MAP_HOME, hospitalCoords]).pad(0.35));
  }, [hospitalCoords[0], hospitalCoords[1], hospitalLabel]);

  // React to stage changes — animate the driver marker smoothly.
  useEffectP(() => {
    const driver = driverRef.current;
    const map = mapRef.current;
    if (!driver || !map) return;

    const visible = active >= 2;
    driver.setOpacity(visible ? 1 : 0);
    if (!visible) return;

    const target = driverTargetForStage(active, hospitalCoords);
    const startLatLng = driver.getLatLng();
    const start = [startLatLng.lat, startLatLng.lng];
    const startTime = performance.now();
    const dur = 1800;

    if (animRef.current) cancelAnimationFrame(animRef.current);
    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      driver.setLatLng(lerpLatLng(start, target, ease));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
      else animRef.current = null;
    };
    animRef.current = requestAnimationFrame(tick);

    if (active === 3 || active === 4 || active === 5) {
      map.flyTo(target, active === 5 ? 14 : 13, { duration: 1.4 });
    }
  }, [active, hospitalCoords[0], hospitalCoords[1]]);

  return (
    <div className="aspect-[16/10] rounded-2xl border border-line overflow-hidden relative bg-paper2">
      <div ref={containerRef} className="smarties-map absolute inset-0" />
      {active < 2 && (
        <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur rounded-xl px-3 py-2 text-xs text-ink font-medium border border-line">
          {placeholderText}
        </div>
      )}
      {typeof window !== "undefined" && typeof window.L === "undefined" && (
        <div className="absolute inset-0 flex items-center justify-center text-mute text-xs px-4 text-center">
          Map could not load. Live tracker still works above.
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── TRIPS LIST ───────────────────────── */

function TripsListPage() {
  const { t } = useI18n();
  const { data, loading } = useApi("/api/trips");
  const upcoming = (data && data.upcoming) || [];
  const past = (data && data.past) || [];

  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <SubHeader title={t("tl.title")} />

      <section className="px-5 mt-1">
        <p className="text-mute text-xs font-semibold uppercase tracking-wide mb-2">{t("tl.upcoming")}</p>
        {loading && <Card className="p-5"><div className="h-4 w-32 bg-paper2 rounded animate-pulse" /></Card>}
        {!loading && upcoming.length === 0 && (
          <Card className="p-5 text-center text-mute text-sm">{t("hm.nothing")}</Card>
        )}
        {!loading && upcoming.map((tp) => (
          <a key={tp.id} href={`#/trip/${tp.reference}`} className="block">
            <Card className="p-5 hover:border-ink/30 transition mb-3">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-goldSoft text-ink inline-flex items-center justify-center"><Icon name="calendar" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-ink font-semibold">{formatTripDate(tp.pickup_at)} · {formatTripTime(tp.pickup_at)}{tp.is_round_trip && tp.return_pickup_at ? ` → ${formatTripTime(tp.return_pickup_at)}` : ""}</p>
                  <p className="text-mute text-sm mt-0.5 truncate">{tp.home_address} → {tp.hospital_name}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Pill tone={tp.status === "confirmed" ? "green" : "gold"}>{tp.status === "confirmed" ? "Confirmed" : "Pending"}</Pill>
                    {tp.is_round_trip ? <Pill tone="navy">{t("tk.roundTrip")}</Pill> : <Pill tone="neutral">{t("tk.oneWay")}</Pill>}
                    {typeof tp.copay === "number" && <Pill tone="gold">${tp.copay}</Pill>}
                  </div>
                </div>
                <Icon name="right" size={20} className="text-mute mt-3" />
              </div>
            </Card>
          </a>
        ))}
      </section>

      <section className="px-5 mt-6 mb-8">
        <p className="text-mute text-xs font-semibold uppercase tracking-wide mb-2">{t("tl.past")}</p>
        <Card className="divide-y divide-line">
          {past.length === 0 && !loading && (
            <div className="p-4 text-center text-mute text-sm">{t("tl.empty")}</div>
          )}
          {past.map((tp) => (
            <a key={tp.id} href={`#/trip/${tp.reference}`} className="p-4 flex items-center gap-3 hover:bg-paper2/40">
              <div className={`h-9 w-9 rounded-lg inline-flex items-center justify-center ${tp.status === "cancelled" ? "bg-paper2 text-danger" : "bg-paper2 text-mute"}`}>
                <Icon name={tp.status === "cancelled" ? "alert" : "check"} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ink font-semibold text-sm">{formatTripDate(tp.pickup_at)}</p>
                <p className="text-mute text-xs mt-0.5 truncate">{tp.home_address ? tp.home_address.split(",")[0] : "Home"} → {tp.hospital_name}</p>
              </div>
              <p className="text-ink font-bold">${tp.copay ?? "—"}</p>
            </a>
          ))}
        </Card>
      </section>
    </div>
  );
}

/* ───────────────────────── PROFILE ───────────────────────── */

function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const session = loadSession() || {};
  const meApi = useApi("/api/me");
  const seniorFromApi = meApi.data && meApi.data.seniors && meApi.data.seniors[0];
  const senior = seniorFromApi || window.AppData.SENIOR;
  const subsidyPct =
    seniorFromApi && typeof seniorFromApi.subsidy_pct === "number"
      ? seniorFromApi.subsidy_pct
      : null;
  const initials = (session.name || "Wei Ming")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Inline promo redemption.
  const [code, setCode] = useStateP("");
  const [phase, setPhase] = useStateP("idle"); // idle | verifying | ok | err
  const [error, setError] = useStateP(null);
  const [result, setResult] = useStateP(null);

  const submitPromo = async () => {
    if (!code.trim()) return;
    setPhase("verifying");
    setError(null);
    try {
      const data = await apiFetch("/api/promo/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      }).catch(async (err) => {
        // apiFetch throws on non-2xx; recover the body for the user message.
        const res = await fetch(`${BACKEND_BASE}/api/promo/redeem`, {
          method: "POST",
          headers: { "X-Caregiver-Id": CAREGIVER_ID, "content-type": "application/json" },
          body: JSON.stringify({ code: code.trim() }),
        });
        return res.json();
      });
      if (!data || !data.ok) {
        setError((data && data.reason) || "Could not redeem this code.");
        setPhase("err");
        return;
      }
      setResult(data);
      setPhase("ok");
      meApi.refresh && meApi.refresh();
    } catch (e) {
      setError("Couldn't reach the server.");
      setPhase("err");
    }
  };

  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <SubHeader title={t("pr.title")} />

      {/* Caregiver identity card */}
      <div className="px-5 mt-1">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-ink text-paper inline-flex items-center justify-center font-bold text-xl">{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-mute text-xs font-semibold uppercase tracking-wide">{t("pr.caregiver")}</p>
              <p className="text-ink font-bold text-[17px]">{session.prefix || "Mr"} {session.name || "Wei Ming"}</p>
              <p className="text-mute text-xs mt-0.5 font-mono tabular-nums tracking-wider">{maskNric(session.nric)}</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider" style={{ background: "#F4333D", color: "white" }}>
              <Icon name="shield" size={11} /> Singpass
            </span>
          </div>
          <Divider className="my-4" />
          <p className="text-mute text-xs">{t("hm.caring")} <span className="text-ink font-semibold">{senior.name}</span> · {senior.age}</p>
        </Card>
      </div>

      <section className="px-5 mt-5">
        <p className="text-mute text-xs font-semibold uppercase tracking-wide mb-2">{t("pr.senior")}</p>
        <Card className="p-5">
          <p className="text-ink font-bold">{senior.name}</p>
          <p className="text-mute text-sm mt-0.5">{senior.age} · {senior.relation || "Mother"} · {senior.mobility === "mobChair" ? "Wheelchair" : senior.mobility === "mobHelp" ? "Walking aid" : senior.mobility || "Walking aid"}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(senior.conditions || []).map((c) => <Pill key={c} tone="neutral">{c}</Pill>)}
          </div>
          {subsidyPct !== null && (
            <>
              <Divider className="my-4" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-mute text-xs font-semibold uppercase tracking-wide">{t("pr.activeSubsidy")}</p>
                  <p className="text-ink font-bold text-[28px] leading-none mt-1 tracking-tight">{subsidyPct}%</p>
                </div>
                <Pill tone="green"><Icon name="check" size={12} /> {t("pr.verified")}</Pill>
              </div>
              <button
                className="focus-ring mt-3 text-mute hover:text-danger text-[11px] font-semibold underline underline-offset-2"
                onClick={async () => {
                  if (!window.confirm(t("pr.resetConfirm"))) return;
                  await apiFetch("/api/demo/reset-subsidy", { method: "POST" }).catch(() => {});
                  window.location.reload();
                }}
              >
                {t("pr.resetSubsidy")}
              </button>
            </>
          )}
        </Card>
      </section>

      {/* Inline promo code redemption */}
      <section className="px-5 mt-5">
        <p className="text-mute text-xs font-semibold uppercase tracking-wide mb-2">{t("pr.subCodeHead")}</p>
        <Card className="p-5">
          {phase !== "ok" && (
            <>
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-xl bg-goldSoft text-ink inline-flex items-center justify-center shrink-0"><Icon name="spark" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-semibold">{t("pr.applyCodeTitle")}</p>
                  <p className="text-mute text-xs mt-0.5 leading-snug">
                    {t("pr.applyCodeDesc")}
                  </p>
                </div>
              </div>
              <textarea
                rows={4}
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SMRT.AXDyuVvb…"
                className="focus-ring mt-3 w-full bg-paper2/60 border border-line rounded-lg px-3 py-2.5 text-ink font-mono text-[12px] leading-snug break-all"
              />
              {error && (
                <div className="mt-3 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-danger text-sm">
                  <Icon name="alert" size={14} className="inline mr-1" /> {error}
                </div>
              )}
              <Btn
                kind="primary"
                className="mt-3 w-full"
                onClick={submitPromo}
                disabled={!code.trim() || phase === "verifying"}
              >
                {phase === "verifying" ? t("pr.verifying") : t("pr.verifyApply")}
              </Btn>
            </>
          )}
          {phase === "ok" && result && (
            <div className="text-center py-2">
              <div className="mx-auto h-14 w-14 rounded-full bg-greenSoft text-green inline-flex items-center justify-center"><Icon name="check" size={32} /></div>
              <p className="mt-3 text-ink font-bold text-[17px]">{t("pr.codeValidated")}</p>
              <p className="text-mute text-sm mt-0.5">{t("pr.issuedBy")} <span className="text-ink font-semibold">{result.issuer}</span> · {t("pr.validUntil")} {result.valid_until}</p>
              <div className="grid grid-cols-2 gap-4 mt-4 text-left">
                <div className="rounded-xl bg-paper2/60 border border-line p-3">
                  <p className="text-mute text-[10px] font-semibold uppercase tracking-wide">{t("pr.newSubsidy")}</p>
                  <p className="text-ink font-bold text-[28px] tracking-tight leading-none mt-1">{result.tier}<span className="text-base">%</span></p>
                </div>
                <div className="rounded-xl bg-paper2/60 border border-line p-3">
                  <p className="text-mute text-[10px] font-semibold uppercase tracking-wide">{t("pr.newCopay")}</p>
                  <p className="text-ink font-bold text-[22px] tracking-tight leading-none mt-1">${result.copay_low}–${result.copay_high}</p>
                </div>
              </div>
              <Btn kind="outline" size="md" className="mt-4 w-full" onClick={() => { setPhase("idle"); setCode(""); setResult(null); }}>
                {t("pr.applyAnother")}
              </Btn>
            </div>
          )}
        </Card>
      </section>

      <section className="px-5 mt-5">
        <p className="text-mute text-xs font-semibold uppercase tracking-wide mb-2">{t("pr.lang")}</p>
        <Card className="p-2 grid grid-cols-4 gap-1">
          {window.AppData.LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`focus-ring h-12 rounded-xl font-semibold text-sm ${l.code === lang ? "bg-ink text-paper" : "text-ink hover:bg-paper2"}`}
              aria-pressed={l.code === lang}
            >
              {l.short}
            </button>
          ))}
        </Card>
      </section>

      <section className="px-5 mt-5">
        <Btn
          kind="outline"
          className="w-full"
          onClick={() => {
            clearSession();
            window.location.reload();
          }}
        >
          {t("pr.signOut")}
        </Btn>
      </section>

      <section className="px-5 mt-5 mb-8">
        <p className="text-mute text-xs font-semibold uppercase tracking-wide mb-2">{t("pr.ack")}</p>
        <p className="text-mute text-xs">{t("pr.version")}</p>
      </section>
    </div>
  );
}

/* ───────────────────────── SINGPASS LOGIN (mock) ───────────────────────── */

function SingpassLoginPage({ onLoggedIn }) {
  const [phase, setPhase] = useStateP("idle"); // idle | submitting | done

  const onLogin = () => {
    setPhase("submitting");
    saveSession({
      nric: "S1234567A",
      name: "Wei Ming",
      prefix: "Mr",
      loginAt: new Date().toISOString(),
    });
    // Reset the demo state to a clean baseline (no subsidy, only seeded
    // trips) on every fresh login. apiFetch reads the session header we
    // just saved.
    apiFetch("/api/demo/reset-all", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        setPhase("done");
        setTimeout(() => onLoggedIn && onLoggedIn(), 250);
      });
  };

  return (
    <div className="min-h-screen w-full bg-paper">
      <div className="max-w-[420px] mx-auto px-5 pt-10 pb-10 flex flex-col min-h-screen">
        {/* Smarties brand strip */}
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-ink text-paper inline-flex items-center justify-center font-bold">S</div>
          <p className="text-ink font-semibold text-[17px]">Smarties</p>
          <span className="text-mute text-xs">· Care, made simpler</span>
        </div>

        {/* Singpass card */}
        <div className="mt-12 rounded-2xl bg-white border border-line shadow-card overflow-hidden">
          <div className="px-5 py-4 flex items-center" style={{ background: "#F4333D" }}>
            <p className="text-white font-bold text-[19px] tracking-tight">singpass</p>
          </div>

          <div className="p-6 text-center">
            <p className="text-ink text-[19px] font-semibold">Log in to Smarties</p>
            <p className="text-mute text-sm mt-1.5 leading-snug">
              Sign in with your Singpass account to manage subsidies and book transport for your loved one.
            </p>

            <Btn
              kind="primary"
              className="mt-7 w-full"
              onClick={onLogin}
              disabled={phase !== "idle"}
            >
              {phase === "submitting" ? (
                <>
                  <span className="h-5 w-5 rounded-full border-[2.5px] border-ink/20 border-t-ink animate-spin" />
                  Authenticating…
                </>
              ) : phase === "done" ? (
                "Welcome back"
              ) : (
                <>
                  <Icon name="shield" size={18} /> Log in with Singpass
                </>
              )}
            </Btn>

          </div>
        </div>

        <div className="mt-auto pt-8 text-center">
          <p className="text-mute text-[11px]">The Good Hack 2026 · GoodHub SEA × OGP</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── PROMO REDEEM ───────────────────────── */

function PromoPage() {
  const session = loadSession();
  const [code, setCode] = useStateP("");
  const [nric, setNric] = useStateP((session && session.nric) || "");
  const [phase, setPhase] = useStateP("idle"); // idle | verifying | ok | err
  const [result, setResult] = useStateP(null);
  const [error, setError] = useStateP(null);

  const submit = async () => {
    if (!code.trim() || !nric.trim()) return;
    setPhase("verifying");
    setError(null);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/promo/redeem`, {
        method: "POST",
        headers: {
          "X-Caregiver-Id": CAREGIVER_ID,
          "content-type": "application/json",
        },
        body: JSON.stringify({ code: code.trim(), nric: nric.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.reason || "Could not redeem this code.");
        setPhase("err");
        return;
      }
      setResult(data);
      setPhase("ok");
    } catch (e) {
      setError("Couldn't reach the server. Try again in a moment.");
      setPhase("err");
    }
  };

  return (
    <div className="page-anim flex-1 phone-scroll overflow-y-auto">
      <SubHeader back="#/profile" title="Apply subsidy code" />
      <p className="px-5 -mt-1 text-mute text-sm">
        Got a signed authorisation from a polyclinic, hospital MSW, or social service agency?
        Paste it here to apply your subsidy.
      </p>

      {phase !== "ok" && (
        <div className="px-5 mt-4 space-y-4">
          <Card className="p-5 space-y-4">
            <div>
              <label className="text-mute text-xs font-semibold uppercase tracking-wide">Senior's NRIC</label>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                value={nric}
                onChange={(e) => setNric(e.target.value)}
                placeholder="S1234567A"
                className="focus-ring mt-1 w-full bg-paper2/60 border border-line rounded-lg px-3 py-2.5 text-ink font-semibold text-[17px] tabular-nums tracking-wider"
              />
              <p className="text-mute text-[11px] mt-1">We hash this locally — your NRIC never leaves the request.</p>
            </div>
            <div>
              <label className="text-mute text-xs font-semibold uppercase tracking-wide">Subsidy code</label>
              <textarea
                rows={5}
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SMRT.eyJ2IjoxLCJp…"
                className="focus-ring mt-1 w-full bg-paper2/60 border border-line rounded-lg px-3 py-2.5 text-ink font-mono text-[12px] leading-snug break-all"
              />
              <p className="text-mute text-[11px] mt-1">Codes start with <span className="font-mono">SMRT.</span> and are cryptographically signed by the issuer.</p>
            </div>
            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-danger text-sm">
                <Icon name="alert" size={14} className="inline mr-1" /> {error}
              </div>
            )}
            <Btn
              kind="primary"
              className="w-full"
              onClick={submit}
              disabled={phase === "verifying" || !code.trim() || !nric.trim()}
            >
              {phase === "verifying" ? "Verifying signature…" : "Verify & apply"}
            </Btn>
          </Card>

          <Card className="p-4">
            <p className="text-ink font-semibold text-sm flex items-center gap-2">
              <Icon name="info" size={16} /> How does this work?
            </p>
            <p className="text-mute text-sm mt-1.5 leading-relaxed">
              The issuer cryptographically signs the code with Ed25519. Smarties verifies it
              against the issuer's public key — no online round-trip is needed to confirm authenticity.
              The code is bound to the senior's NRIC, so it can't be reused by someone else.
            </p>
          </Card>
        </div>
      )}

      {phase === "ok" && result && (
        <div className="px-5 mt-6">
          <div className="text-center">
            <div className="mx-auto h-20 w-20 rounded-full bg-greenSoft text-green inline-flex items-center justify-center">
              <Icon name="check" size={44} />
            </div>
            <h2 className="mt-4 text-ink text-[26px] font-bold">Code validated</h2>
            <p className="text-mute mt-1 max-w-[420px] mx-auto">
              Issued by <span className="text-ink font-semibold">{result.issuer}</span>. All your future MET trips automatically use this subsidy.
            </p>
          </div>
          <Card className="mt-6 p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-mute text-xs font-semibold uppercase tracking-wide">Subsidy</p>
                <p className="text-[56px] font-bold text-ink leading-none mt-1 tracking-tight">{result.tier}<span className="text-2xl">%</span></p>
              </div>
              <div>
                <p className="text-mute text-xs font-semibold uppercase tracking-wide">New co-pay</p>
                <p className="text-[36px] font-bold text-ink leading-none mt-1 tracking-tight">${result.copay_low}–${result.copay_high}</p>
                <p className="text-mute text-xs mt-1">per round trip</p>
              </div>
            </div>
            <Divider className="my-5" />
            <p className="text-mute text-xs">Valid until {result.valid_until}.</p>
          </Card>
          <div className="mt-6 flex gap-3">
            <a href="#/home" className="flex-1"><Btn kind="primary" className="w-full">Back to home <Icon name="right" size={16} /></Btn></a>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  HomePage, OnboardingPage, TripNewPage, ProvidersPage, ApplyPage, TripTrackerPage, TripsListPage, ProfilePage,
  SingpassLoginPage, PromoPage,
});
