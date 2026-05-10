import type { Caregiver, Provider, Senior, Trip } from "./types";

// Row → typed object helpers. D1 returns columns as `unknown`; do the
// JSON-parsing and casts in one place so routes stay clean.

interface SeniorRow {
  id: string;
  caregiver_id: string;
  name: string;
  age: number;
  relation: string | null;
  mobility: string | null;
  conditions_json: string;
  home_address: string | null;
  postal_code: string | null;
  citizenship: string | null;
  income_band: string | null;
  subsidy_pct: number | null;
  copay_low: number | null;
  copay_high: number | null;
  eligibility_at: string | null;
}

export function rowToSenior(row: SeniorRow): Senior {
  return {
    id: row.id,
    caregiver_id: row.caregiver_id,
    name: row.name,
    age: row.age,
    relation: row.relation,
    mobility: row.mobility as Senior["mobility"],
    conditions: safeJsonArray(row.conditions_json),
    home_address: row.home_address,
    postal_code: row.postal_code,
    citizenship: row.citizenship as Senior["citizenship"],
    income_band: row.income_band as Senior["income_band"],
    subsidy_pct: row.subsidy_pct,
    copay_low: row.copay_low,
    copay_high: row.copay_high,
    eligibility_at: row.eligibility_at,
  };
}

interface ProviderRow extends Omit<Provider, "serves_postcodes"> {
  serves_postcodes: string;
}

export function rowToProvider(row: ProviderRow): Provider {
  return { ...row, serves_postcodes: safeJsonArray(row.serves_postcodes) };
}

export function rowToTrip(row: Trip & { notify_home_safe: number; is_round_trip: number }): Trip {
  return {
    ...row,
    notify_home_safe: (row.notify_home_safe ? 1 : 0) as 0 | 1,
    is_round_trip: (row.is_round_trip ? 1 : 0) as 0 | 1,
  };
}

export type CaregiverRow = Caregiver;

function safeJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function shortRef(): string {
  // MET-XXXXXX (6 hex chars) — uppercase, deterministic-looking.
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `MET-${hex.toUpperCase()}`;
}
