// Reusable UI primitives + icons. Globals: Icon, Card, Btn, Pill, etc.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ───────────────────────── ICONS (inline SVG) ───────────────────────── */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

const Icon = ({ name, size = 20, className = "" }) => {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 24 24", className, ...stroke };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9h14v-9" /></svg>;
    case "trips":
      return <svg {...common}><path d="M4 17h12a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h11" /><circle cx="6" cy="17" r="2" /><circle cx="18" cy="7" r="2" /></svg>;
    case "profile":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" /></svg>;
    case "back":
      return <svg {...common}><path d="M15 5l-7 7 7 7" /></svg>;
    case "right":
      return <svg {...common}><path d="M9 5l7 7-7 7" /></svg>;
    case "check":
      return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
    case "spark":
      return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>;
    case "wheelchair":
      return <svg {...common}><circle cx="9" cy="5" r="1.5" /><path d="M9 7v5h5l2 4" /><path d="M9 12a5 5 0 1 0 4.5 7" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "phone":
      return <svg {...common}><path d="M5 4h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
    case "pin":
      return <svg {...common}><path d="M12 22s7-7.6 7-13a7 7 0 1 0-14 0c0 5.4 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "edit":
      return <svg {...common}><path d="M4 20h4l11-11-4-4L4 16v4z" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 8v.5" /></svg>;
    case "globe":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
    case "alert":
      return <svg {...common}><path d="M12 4l10 17H2L12 4z" /><path d="M12 11v4M12 18v.5" /></svg>;
    case "bell":
      return <svg {...common}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
    case "heart":
      return <svg {...common}><path d="M12 20s-8-4.5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6.5-8 11-8 11z" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
    case "car":
      return <svg {...common}><path d="M4 14l2-6h12l2 6v5h-3v-2H7v2H4v-5z" /><circle cx="8" cy="16" r="1.2" /><circle cx="16" cy="16" r="1.2" /></svg>;
    case "van":
      return <svg {...common}><path d="M3 16V8h11l4 4h3v4" /><path d="M3 16h18v3H3z" /><circle cx="7" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></svg>;
    case "doc":
      return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" /></svg>;
    case "dollar":
      return <svg {...common}><path d="M12 3v18" /><path d="M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    default:
      return null;
  }
};

/* ───────────────────────── PRIMITIVES ───────────────────────── */

const Card = ({ children, className = "", as: As = "div", ...rest }) => (
  <As className={`bg-white rounded-2xl border border-line shadow-card ${className}`} {...rest}>
    {children}
  </As>
);

const Btn = ({ kind = "primary", size = "lg", className = "", children, ...rest }) => {
  const sizes = { lg: "h-14 px-6 text-[17px]", md: "h-12 px-5 text-[15px]", sm: "h-10 px-4 text-sm" };
  const kinds = {
    primary: "bg-gold text-ink hover:bg-[#cf9a3e] active:bg-[#c08e34] shadow-lift",
    primaryNavy: "bg-ink text-paper hover:bg-ink2",
    outline: "bg-transparent text-ink border border-ink/25 hover:bg-ink/5",
    ghost: "bg-transparent text-ink hover:bg-ink/5",
    soft: "bg-paper2 text-ink hover:bg-[#ebe2cf]",
    green: "bg-green text-white hover:bg-[#1a6740]",
    danger: "bg-transparent text-danger border border-danger/30 hover:bg-danger/5",
  };
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition select-none disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none disabled:cursor-not-allowed ${sizes[size]} ${kinds[kind]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

const Pill = ({ children, tone = "neutral", className = "" }) => {
  const tones = {
    neutral: "bg-paper2 text-ink2",
    gold: "bg-goldSoft text-[#7a5a1d] border border-gold/40",
    green: "bg-greenSoft text-green border border-green/30",
    navy: "bg-ink text-paper",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
};

const Divider = ({ className = "" }) => <div className={`h-px bg-line ${className}`} />;

/* ───────────────────────── i18n hook ───────────────────────── */

const I18nContext = React.createContext({ lang: "en", t: (p) => p, setLang: () => {} });

function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem("smarties.lang") || "en");
  const setLang = useCallback((l) => {
    setLangState(l);
    localStorage.setItem("smarties.lang", l);
  }, []);
  const dict = window.AppData.TRANSLATIONS[lang] || window.AppData.TRANSLATIONS.en;
  const t = useCallback((path) => {
    const parts = path.split(".");
    let v = dict;
    for (const p of parts) v = v?.[p];
    if (v === undefined) {
      // fallback to en
      let f = window.AppData.TRANSLATIONS.en;
      for (const p of parts) f = f?.[p];
      return f ?? path;
    }
    return v;
  }, [dict]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

const useI18n = () => React.useContext(I18nContext);

/* ───────────────────────── Top + bottom chrome ───────────────────────── */

function TopBar({ onLangChange }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const cur = window.AppData.LANGS.find((l) => l.code === lang);
  return (
    <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center justify-between">
        <a href="#/home" className="focus-ring flex items-center gap-2 rounded-lg" aria-label="CareHop home">
          <span className="inline-flex h-8 w-8 rounded-lg bg-ink text-paper items-center justify-center font-extrabold tracking-tight">C</span>
          <span className="font-bold text-ink text-[17px]">CareHop</span>
          <span className="hidden sm:inline text-mute text-xs ml-1">· {t("tag")}</span>
        </a>
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="focus-ring h-10 px-3 rounded-full border border-line bg-white flex items-center gap-2 text-sm font-semibold text-ink"
            aria-haspopup="listbox" aria-expanded={open}
          >
            <Icon name="globe" size={16} />
            <span>{cur.short}</span>
          </button>
          {open && (
            <div role="listbox" className="absolute right-0 mt-2 w-44 bg-white rounded-xl border border-line shadow-lift overflow-hidden">
              {window.AppData.LANGS.map((l) => (
                <button
                  key={l.code}
                  role="option"
                  aria-selected={l.code === lang}
                  onClick={() => { setLang(l.code); setOpen(false); onLangChange?.(l.code); }}
                  className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-paper2 ${l.code === lang ? "text-ink" : "text-mute"}`}
                >
                  <span className="inline-block w-12 font-bold">{l.short}</span>
                  <span>{l.long}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomNav({ route }) {
  const { t } = useI18n();
  const items = [
    { key: "home", icon: "home", label: t("nav.home"), href: "#/home" },
    { key: "trips", icon: "trips", label: t("nav.trips"), href: "#/trips" },
    { key: "profile", icon: "profile", label: t("nav.profile"), href: "#/profile" },
  ];
  // determine active
  const active =
    route.startsWith("home") ? "home" :
    route.startsWith("trip") || route.startsWith("providers") || route.startsWith("apply") ? "trips" :
    route.startsWith("profile") ? "profile" : "home";
  return (
    <nav className="sticky bottom-0 z-30 bg-paper/95 backdrop-blur border-t border-line">
      <div className="mx-auto max-w-[720px] grid grid-cols-3" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.map((it) => {
          const isActive = active === it.key;
          return (
            <a
              key={it.key}
              href={it.href}
              className={`focus-ring flex flex-col items-center justify-center gap-1 py-2.5 min-h-[64px] font-semibold text-[12px] ${isActive ? "text-ink" : "text-mute"}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={`inline-flex items-center justify-center h-8 w-12 rounded-full ${isActive ? "bg-goldSoft" : ""}`}>
                <Icon name={it.icon} size={20} />
              </span>
              <span>{it.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/* ───────────────────────── Phone-frame for desktop preview ───────────────────────── */

function Phone({ children }) {
  return (
    <div className="min-h-screen w-full flex flex-col">
      <div className="mx-auto w-full max-w-[720px] flex-1 bg-paper shadow-[0_0_0_1px_rgba(11,37,69,0.06),0_30px_60px_-20px_rgba(11,37,69,0.18)] sm:my-6 sm:rounded-3xl overflow-hidden flex flex-col min-h-[100dvh] sm:min-h-[820px]">
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Page header (back row) ───────────────────────── */

function SubHeader({ back, title, right }) {
  return (
    <div className="px-4 pt-4 pb-2 flex items-center gap-2">
      {back && (
        <a href={back} className="focus-ring h-11 w-11 -ml-2 inline-flex items-center justify-center rounded-full text-ink hover:bg-paper2" aria-label="Back">
          <Icon name="back" />
        </a>
      )}
      {title && <h1 className="text-[22px] font-bold text-ink leading-tight flex-1 truncate">{title}</h1>}
      {right}
    </div>
  );
}

/* expose */
Object.assign(window, {
  Icon, Card, Btn, Pill, Divider, TopBar, BottomNav, Phone, SubHeader,
  I18nProvider, useI18n,
});
