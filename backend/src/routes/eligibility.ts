import { Hono } from "hono";
import { computeEligibility, type EligibilityInput } from "../eligibility";
import type { Env } from "../types";

export const eligibilityRoutes = new Hono<{
  Bindings: Env;
  Variables: { caregiverId: string };
}>();

// Stateless verdict — used by the onboarding wizard before a senior is
// created/picked. Frontend can render the verdict screen without persisting.
eligibilityRoutes.post("/check", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<EligibilityInput>;
  const error = validate(body);
  if (error) return c.json({ error }, 400);
  return c.json(computeEligibility(body as EligibilityInput));
});

// Persist the answer set + verdict against a senior so the home/profile/quote
// screens can read it without re-asking.
eligibilityRoutes.post("/seniors/:seniorId", async (c) => {
  const seniorId = c.req.param("seniorId");
  const caregiverId = c.get("caregiverId");
  const body = (await c.req.json().catch(() => ({}))) as Partial<EligibilityInput>;
  const error = validate(body);
  if (error) return c.json({ error }, 400);
  const input = body as EligibilityInput;

  const owner = await c.env.DB.prepare(
    "SELECT caregiver_id FROM seniors WHERE id = ?",
  )
    .bind(seniorId)
    .first<{ caregiver_id: string }>();
  if (!owner) return c.json({ error: "senior not found" }, 404);
  if (owner.caregiver_id !== caregiverId) return c.json({ error: "forbidden" }, 403);

  const verdict = computeEligibility(input);
  await c.env.DB.prepare(
    `UPDATE seniors
        SET citizenship = ?, mobility = ?, age = ?, income_band = ?,
            subsidy_pct = ?, copay_low = ?, copay_high = ?,
            eligibility_at = ?
      WHERE id = ?`,
  )
    .bind(
      input.citizenship,
      input.mobility,
      input.age,
      input.income,
      verdict.subsidy_pct,
      verdict.copay_low,
      verdict.copay_high,
      new Date().toISOString(),
      seniorId,
    )
    .run();
  return c.json(verdict);
});

function validate(b: Partial<EligibilityInput>): string | null {
  if (!b.citizenship || !["sg", "pr", "none"].includes(b.citizenship))
    return "citizenship must be sg|pr|none";
  if (typeof b.age !== "number" || b.age < 18 || b.age > 120)
    return "age must be a number between 18 and 120";
  if (!b.mobility || !["mobIndep", "mobHelp", "mobChair"].includes(b.mobility))
    return "mobility must be mobIndep|mobHelp|mobChair";
  if (!b.income || !["inc1", "inc2", "inc3", "inc4"].includes(b.income))
    return "income must be inc1|inc2|inc3|inc4";
  return null;
}
