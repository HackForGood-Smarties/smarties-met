import type { Citizenship, IncomeBand, Mobility } from "./types";

// Placeholder formula — same numbers as prototype/data.jsx so the verdict screen
// matches today's design while we wait for the real AIC subsidy table.
export interface EligibilityInput {
  citizenship: Citizenship;
  age: number;
  mobility: Mobility;
  income: IncomeBand;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  subsidy_pct: number;
  copay_low: number;
  copay_high: number;
}

const BASE_LOW = 40;
const BASE_HIGH = 45;

export function computeEligibility(input: EligibilityInput): EligibilityResult {
  if (input.citizenship === "none") {
    return {
      eligible: false,
      reason: "MET subsidies require Singapore Citizen or PR status.",
      subsidy_pct: 0,
      copay_low: BASE_LOW,
      copay_high: BASE_HIGH,
    };
  }
  if (input.age < 60) {
    return {
      eligible: false,
      reason: "MET subsidies typically apply from age 60.",
      subsidy_pct: 0,
      copay_low: BASE_LOW,
      copay_high: BASE_HIGH,
    };
  }

  let subsidy: number;
  switch (input.income) {
    case "inc1": subsidy = 80; break;
    case "inc2": subsidy = 70; break;
    case "inc3": subsidy = 50; break;
    case "inc4": subsidy = 65; break;
  }
  if (input.mobility === "mobChair") subsidy = Math.min(85, subsidy + 5);

  return {
    eligible: true,
    subsidy_pct: subsidy,
    copay_low: Math.round(BASE_LOW * (1 - subsidy / 100)),
    copay_high: Math.round(BASE_HIGH * (1 - subsidy / 100)),
  };
}
