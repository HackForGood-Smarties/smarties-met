import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth";
import { demoRoutes } from "./routes/demo";
import { eligibilityRoutes } from "./routes/eligibility";
import { meRoutes } from "./routes/me";
import { promoRoutes } from "./routes/promo";
import { providerRoutes } from "./routes/providers";
import { tripRoutes } from "./routes/trips";
import type { Env } from "./types";

export { TripRoom } from "./trip-do";

const app = new Hono<{ Bindings: Env; Variables: { caregiverId: string } }>();

app.use("*", cors({
  origin: (origin, c) =>
    c.env.ALLOW_ANY_ORIGIN === "true" ? origin || "*" : origin,
  allowHeaders: ["content-type", "x-caregiver-id", "upgrade"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["x-trip-id"],
  credentials: false,
}));

app.get("/", (c) =>
  c.json({
    service: "smarties-backend",
    version: "0.1.0",
    docs: [
      "POST   /api/auth/login            { email }",
      "GET    /api/me",
      "PATCH  /api/me/language           { language }",
      "POST   /api/eligibility/check     { citizenship, age, mobility, income }",
      "POST   /api/eligibility/seniors/:seniorId  { same }",
      "GET    /api/promo/pubkey          (Ed25519 pubkey for offline verification)",
      "POST   /api/promo/issue           { nric, tier, iss?, validUntil? } (demo issuer)",
      "POST   /api/promo/redeem          { code, nric }",
      "POST   /api/demo/reset-subsidy    (clears subsidy for the caregiver's senior)",
      "GET    /api/providers?postalCode=560234",
      "POST   /api/trips/quote           { seniorId, hospitalName?, pickupAt? }",
      "GET    /api/trips",
      "POST   /api/trips                 { seniorId, providerId, hospitalName, pickupAt, ... }",
      "GET    /api/trips/:id",
      "POST   /api/trips/:id/advance     { stage?, note? }",
      "POST   /api/trips/:id/auto-start  (demo: tick stage every N seconds)",
      "POST   /api/trips/:id/cancel",
      "PATCH  /api/trips/:id/notify      { enabled }",
      "GET    /api/trips/:id/live        (WebSocket)",
      "GET    /api/trips/stages",
    ],
  }),
);

// Mock auth: every protected route reads X-Caregiver-Id. Real auth is the
// problem of whatever ships after the hackathon.
app.use("/api/me/*", attachCaregiver);
app.use("/api/me", attachCaregiver);
app.use("/api/eligibility/seniors/*", attachCaregiver);
app.use("/api/trips", attachCaregiver);
app.use("/api/trips/*", attachCaregiver);
app.use("/api/promo/redeem", attachCaregiver);
app.use("/api/demo/*", attachCaregiver);

app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/eligibility", eligibilityRoutes);
app.route("/api/promo", promoRoutes);
app.route("/api/providers", providerRoutes);
app.route("/api/trips", tripRoutes);
app.route("/api/demo", demoRoutes);

async function attachCaregiver(
  c: any,
  next: () => Promise<void>,
): Promise<Response | void> {
  // Browsers can't set custom headers on WebSocket handshakes, so the
  // /trips/:id/live route also accepts ?caregiverId=...
  const id = c.req.header("X-Caregiver-Id") ?? c.req.query("caregiverId");
  if (!id)
    return c.json({ error: "missing X-Caregiver-Id header or caregiverId query param" }, 401);
  c.set("caregiverId", id);
  await next();
}

export default app;
