import { Hono } from "hono";
import type { Env } from "../types";

// Mock auth for the hackathon: pass `email` and we return a session header
// the frontend can echo back via `X-Caregiver-Id`. Real Singpass / Sign in
// with Apple / etc. is a Year-2 conversation.
export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "weiming@smarties.demo").trim().toLowerCase();

  const cg = await c.env.DB.prepare(
    "SELECT id, name, email, phone, language FROM caregivers WHERE email = ?",
  )
    .bind(email)
    .first<{
      id: string;
      name: string;
      email: string;
      phone: string | null;
      language: string;
    }>();

  if (!cg) return c.json({ error: "no caregiver with that email" }, 404);
  return c.json({ caregiver: cg, session: { caregiverId: cg.id } });
});
