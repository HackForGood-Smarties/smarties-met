-- Seed data for the Smarties demo.
-- Mirrors prototype/data.jsx so the existing UI screens render unchanged.

-- 1 caregiver: Wei Ming
INSERT INTO caregivers (id, name, email, phone, language) VALUES
  ('cg_weiming', 'Wei Ming', 'weiming@smarties.demo', '+6591234567', 'en');

-- 1 senior under his care: Madam Lim Soo Hoon, 78
-- Pre-cached eligibility (75% / co-pay $10–$11) — answer set: sg, age 78, mobHelp, inc2
INSERT INTO seniors (
  id, caregiver_id, name, age, relation, mobility, conditions_json,
  home_address, postal_code, citizenship, income_band,
  subsidy_pct, copay_low, copay_high, eligibility_at
) VALUES (
  'sn_madamlim', 'cg_weiming',
  'Madam Lim Soo Hoon', 78, 'Mother',
  'mobHelp',
  '["Mild diabetes","Knee osteoarthritis"]',
  '234 Ang Mo Kio Ave 3', '560234',
  'sg', 'inc2',
  70, 12, 14, '2026-04-30T08:00:00Z'
);

-- 3 MET providers, matching the prototype tile colours.
-- serves_postcodes lists 2-digit postal prefixes. SG postal-code district map:
--   53 = Toa Payoh, 56 = Bishan/AMK, 57 = Bishan/AMK, 75/76 = Sembawang, 76/77 = Yishun.
INSERT INTO providers (id, name, initials, bg_color, fg_color, serves, serves_postcodes, copay_low, copay_high, response_min, note, phone) VALUES
  ('touch',   'TOUCH Community Services', 'T', '#0B2545', '#F6E7C5',
   'Ang Mo Kio · Bishan · Toa Payoh',
   '["53","56","57","73"]', 10, 14, 6,
   'Wheelchair-accessible vans, Mandarin-speaking escorts.',
   '+6568046555'),
  ('blossom', 'Blossom Seeds',            'B', '#1F7A4D', '#E3F1E8',
   'Sembawang · Yishun · AMK North',
   '["56","75","76","77"]', 11, 15, 9,
   'Community drivers trained in dementia care.',
   '+6567575433'),
  ('hca',     'HCA Hospice Care',         'H', '#D4A24C', '#0B2545',
   'Island-wide for palliative',
   '["00","01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59","60","61","62","63","64","65","66","67","68","69","70","71","72","73","74","75","76","77","78","79","80"]',
   12, 16, 12,
   'Specialised vehicles for palliative & home-bound seniors.',
   '+6562510770');

-- 1 upcoming trip — the demo hero. Currently at stage 2 (driver assigned)
-- so the tracker has data for the driver card and the next-trip card.
INSERT INTO trips (
  id, reference, caregiver_id, senior_id, provider_id, status, stage,
  home_address, hospital_name, hospital_address,
  pickup_at, arrives_at,
  driver_name, driver_vehicle, driver_plate, escort_name,
  copay, grab_low, grab_high, notify_home_safe
) VALUES (
  'trip_upcoming', 'MET-2A4F19', 'cg_weiming', 'sn_madamlim', 'touch',
  'confirmed', 2,
  '234 Ang Mo Kio Ave 3', 'Singapore General Hospital', 'Outram Rd, Singapore 169608',
  '2026-05-15T09:00:00+08:00', '2026-05-15T09:35:00+08:00',
  'Mr. Tan', 'Toyota Hiace', 'SGW 8421C', 'Mei Ling',
  12, 32, 38, 1
);

-- Event log: stages 0, 1, 2 already happened.
INSERT INTO trip_events (trip_id, stage, status, note, occurred_at) VALUES
  ('trip_upcoming', 0, 'pending',   'Application sent to TOUCH Community Services', '2026-05-09T18:42:00+08:00'),
  ('trip_upcoming', 1, 'confirmed', 'Confirmed by provider',                          '2026-05-09T20:11:00+08:00'),
  ('trip_upcoming', 2, 'confirmed', 'Driver Mr. Tan + escort Mei Ling assigned',      '2026-05-14T10:00:00+08:00');

-- 3 past trips — populates the Trips list "Past" section.
INSERT INTO trips (
  id, reference, caregiver_id, senior_id, provider_id, status, stage,
  home_address, hospital_name, pickup_at, arrives_at, copay, grab_low, grab_high
) VALUES
  ('trip_past_1', 'MET-19BCDE', 'cg_weiming', 'sn_madamlim', 'touch',  'completed', 5,
   '234 Ang Mo Kio Ave 3', 'Singapore General Hospital',
   '2026-04-17T08:30:00+08:00', '2026-04-17T09:10:00+08:00', 12, 32, 38),
  ('trip_past_2', 'MET-12FA3C', 'cg_weiming', 'sn_madamlim', 'blossom','completed', 5,
   '234 Ang Mo Kio Ave 3', 'AMK Polyclinic',
   '2026-03-20T09:00:00+08:00', '2026-03-20T09:15:00+08:00', 8,  18, 22),
  ('trip_past_3', 'MET-0AA771', 'cg_weiming', 'sn_madamlim', 'touch',  'completed', 5,
   '234 Ang Mo Kio Ave 3', 'Singapore General Hospital',
   '2026-02-04T08:30:00+08:00', '2026-02-04T09:05:00+08:00', 12, 32, 38);
