export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  TRIP_DO: DurableObjectNamespace;
  AI: Ai;
  DEMO_AUTO_ADVANCE_SECONDS: string;
  ALLOW_ANY_ORIGIN: string;
}

export type Mobility = "mobIndep" | "mobHelp" | "mobChair";
export type Citizenship = "sg" | "pr" | "none";
export type IncomeBand = "inc1" | "inc2" | "inc3" | "inc4";
export type TripStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export const STAGES = [
  "Application sent",
  "Confirmed by provider",
  "Driver assigned",
  "En route to pickup",
  "Senior boarded",
  "Arrived at hospital",
  // Round-trip continuation:
  "At appointment",
  "Heading home",
  "Home safe",
] as const;

export const ONE_WAY_FINAL_STAGE = 5;
export type StageIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface Caregiver {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  language: string;
}

export interface Senior {
  id: string;
  caregiver_id: string;
  name: string;
  age: number;
  relation: string | null;
  mobility: Mobility | null;
  conditions: string[];
  home_address: string | null;
  postal_code: string | null;
  citizenship: Citizenship | null;
  income_band: IncomeBand | null;
  subsidy_pct: number | null;
  copay_low: number | null;
  copay_high: number | null;
  eligibility_at: string | null;
}

export interface Provider {
  id: string;
  name: string;
  initials: string;
  bg_color: string;
  fg_color: string;
  serves: string;
  serves_postcodes: string[];
  copay_low: number;
  copay_high: number;
  response_min: number;
  note: string | null;
  phone: string | null;
}

export interface Trip {
  id: string;
  reference: string;
  caregiver_id: string;
  senior_id: string;
  provider_id: string | null;
  status: TripStatus;
  stage: number;
  home_address: string;
  hospital_name: string;
  hospital_address: string | null;
  pickup_at: string;
  arrives_at: string | null;
  is_round_trip: 0 | 1;
  return_pickup_at: string | null;
  return_arrives_at: string | null;
  driver_name: string | null;
  driver_vehicle: string | null;
  driver_plate: string | null;
  escort_name: string | null;
  copay: number | null;
  grab_low: number | null;
  grab_high: number | null;
  notify_home_safe: 0 | 1;
  created_at: string;
}
