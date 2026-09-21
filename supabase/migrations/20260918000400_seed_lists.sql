-- Seed from Timesheet- Version 02.xlsm (Lists sheet), generated 2026-09-18.
-- Staff are NOT seeded: they arrive by email invite (auth.users -> profiles).

insert into public.settings (id) values (true) on conflict do nothing;

insert into public.work_types (name, sort_order) values
  ('Site Visit', 10),
  ('Original Scope', 20),
  ('Additional Scope', 30),
  ('Variation by Architect', 40),
  ('Variation by Builder', 50),
  ('Variation by Client', 60),
  ('Our Mistake', 70),
  ('BC Stage', 80),
  ('Council RFI', 90),
  ('Zoom meeting', 100),
  ('Admin works', 110),
  ('Internal meeting', 120)
on conflict (name) do nothing;

insert into public.clients (name) values
  ('Amiri'),
  ('Anchal'),
  ('Brendon'),
  ('Daniel'),
  ('Edison/Daniel'),
  ('Fletch'),
  ('Gaze'),
  ('Kanwabir'),
  ('Patti'),
  ('Stable'),
  ('Sushil/David')
on conflict (name) do nothing;

-- Stable 01-03 are the internal, non-chargeable buckets.
insert into public.projects (project_no, name, client_id, is_internal, default_chargeable)
select v.project_no, v.name, c.id, v.is_internal, not v.is_internal
from (values
  ('Stable 03', 'Admin', 'Stable', true),
  ('Stable 02', 'Intenal Discussion', 'Stable', true),
  ('Stable 01', 'Internal Zoom meeting', 'Stable', true),
  ('22166-lot 127', '25 Burberry Rd', 'Patti', false),
  ('26104', '129 Ellicott', 'Kanwabir', false),
  ('26103', 'Lift remedial', 'Gaze', false),
  ('26102', '35 Great West Rd', 'Amiri', false),
  ('26086', '28 Richard', 'Anchal', false),
  ('26060', '31 Beaconsfield', 'Brendon', false),
  ('26035', '103 Esplanade', 'Fletch', false),
  ('26001', '10 Combes Rd', 'Daniel', false),
  ('25106', '3 Donnell Ave', 'Daniel', false),
  ('24149', '59 Ascot Ave', 'Daniel', false),
  ('24006', '375 West Coast rd', 'Sushil/David', false),
  ('22166', '25 Burberry Rd', 'Edison/Daniel', false),
  ('22166-lot 60-63', '25 Burberry Rd', 'Patti', false),
  ('25139', '29 Mawney Road', null, false),
  ('26059', '16 Puketia', null, false)
) as v (project_no, name, client, is_internal)
left join public.clients c on c.name = v.client
on conflict (project_no) do nothing;

-- Charge-out rates. Projects not listed here had no rate in the workbook
-- and show the 'no charge-out rate' warning until an admin sets one.
-- (none of the workbook projects had a rate > 0)
