// App shell + hash router + Singpass login gate

const { useState: useStateA, useEffect: useEffectA } = React;

function useHashRoute() {
  const [hash, setHash] = useStateA(() => window.location.hash || "#/home");
  useEffectA(() => {
    const onChange = () => {
      setHash(window.location.hash || "#/home");
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#\/?/, ""); // "home", "trip/new", "trip/MET-2A4F19", "apply/touch", "promo"
}

function App() {
  // Singpass-mock session gate. If absent, render the splash login page
  // instead of the app shell. Logging in writes to localStorage and
  // re-renders.
  const [hasSession, setHasSession] = useStateA(() => !!loadSession());
  useEffectA(() => {
    const onStorage = () => setHasSession(!!loadSession());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // IMPORTANT: hooks must run in the same order on every render. Call
  // useHashRoute unconditionally even if we're going to render the
  // login splash, so React doesn't throw "Rendered more hooks than during
  // the previous render" when the gate flips.
  const route = useHashRoute();

  if (!hasSession) {
    return <SingpassLoginPage onLoggedIn={() => setHasSession(true)} />;
  }

  const [seg0, seg1] = route.split("/");

  let page;
  if (seg0 === "" || seg0 === "home") page = <HomePage />;
  else if (seg0 === "onboarding") page = <OnboardingPage />;
  else if (seg0 === "trip" && seg1 === "new") page = <TripNewPage />;
  else if (seg0 === "trip" && seg1) page = <TripTrackerPage tripId={seg1} />;
  else if (seg0 === "trips") page = <TripsListPage />;
  else if (seg0 === "providers") page = <ProvidersPage />;
  else if (seg0 === "apply") page = <ApplyPage providerId={seg1 || "touch"} />;
  else if (seg0 === "promo") page = <PromoPage />;
  else if (seg0 === "profile") page = <ProfilePage />;
  else page = <HomePage />;

  return (
    <Phone>
      <TopBar />
      {page}
      <BottomNav route={route} />
    </Phone>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <I18nProvider><App /></I18nProvider>
);
