-- Stable Structure timesheet portal: ALL MIGRATIONS (for a fresh, empty project)
begin;

-- ===== migrations/20260918000100_schema.sql =====
-- Stable Structure timesheet portal: core schema.
-- Mirrors "Timesheet- Version 02.xlsm": Lists -> staff/projects/work_types/settings,
-- TimeLog -> time_entries (+ entry_billing), Invoice -> invoices.
-- Money columns live in their own tables so row-level security can hide
-- charge-out rates and values from the employee role.

create schema if not exists app;

create type public.app_role       as enum ('employee', 'approver', 'admin');
create type public.entry_status   as enum ('draft', 'submitted', 'returned', 'approved', 'invoiced');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');
create type public.project_status as enum ('active', 'on_hold', 'closed');

-- Lists!B29 (GSTRate), Hours Check standard day, Invoice sheet header/terms.
create table public.settings (
  id                  boolean primary key default true check (id),
  company_name        text    not null default 'Stable Structure Limited',
  company_tagline     text    not null default 'Structural & Civil Engineering',
  gst_number          text,
  address             text,
  contact_line        text,
  bank_details        text,
  gst_rate            numeric(5,4) not null default 0.15 check (gst_rate >= 0 and gst_rate < 1),
  standard_day_hours  numeric(4,2) not null default 8 check (standard_day_hours > 0 and standard_day_hours <= 24),
  invoice_prefix      text    not null default 'INV-',
  next_invoice_no     integer not null default 1 check (next_invoice_no > 0),
  payment_terms_days  integer not null default 14 check (payment_terms_days >= 0),
  updated_at          timestamptz not null default now()
);

-- Lists!A (EmpList). One row per auth user; deactivate, never delete.
create table public.profiles (
  user_id             uuid primary key references auth.users (id) on delete restrict,
  display_name        text not null check (length(btrim(display_name)) > 0),
  email               text not null,
  role                public.app_role not null default 'employee',
  standard_day_hours  numeric(4,2) check (standard_day_hours > 0 and standard_day_hours <= 24),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Lists!E (ProjClient), promoted to its own record.
create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique check (length(btrim(name)) > 0),
  billing_email  text,
  address        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Lists!C:D (ProjNo, ProjName). The rate is in project_rates.
create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  project_no          text not null unique check (length(btrim(project_no)) > 0),
  -- not unique: the workbook has three lots all named "25 Burberry Rd"
  name                text not null check (length(btrim(name)) > 0),
  client_id           uuid references public.clients (id) on delete restrict,
  is_internal         boolean not null default false,
  default_chargeable  boolean not null default true,
  status              public.project_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Lists!F (ProjRate). No row / null rate = "project has no charge-out rate".
create table public.project_rates (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  rate        numeric(10,2) check (rate >= 0),
  updated_at  timestamptz not null default now()
);

-- Lists!H (WorkTypeList).
create table public.work_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(btrim(name)) > 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Invoice sheet. Declared before time_entries for the FK.
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  invoice_no   text not null unique,
  project_id   uuid not null references public.projects (id) on delete restrict,
  client_id    uuid references public.clients (id) on delete restrict,
  period_from  date not null,
  period_to    date not null,
  issued_on    date not null default current_date,
  due_on       date not null,
  total_hours  numeric(8,2)  not null default 0,
  subtotal     numeric(12,2) not null default 0,
  gst_rate     numeric(5,4)  not null,
  gst          numeric(12,2) not null default 0,
  total        numeric(12,2) not null default 0,
  status       public.invoice_status not null default 'draft',
  pdf_path     text,
  created_by   uuid references public.profiles (user_id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (period_to >= period_from)
);

-- Timesheet!TimeLog. Drafts may be incomplete (the amber rows in the workbook);
-- anything past draft must be a complete entry.
create table public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (user_id) on delete restrict,
  entry_date    date not null,
  project_id    uuid references public.projects (id) on delete restrict,
  work_type_id  uuid references public.work_types (id) on delete restrict,
  chargeable    boolean not null default true,
  hours         numeric(5,2) check (hours >= 0 and hours <= 24),
  description   text not null default '',
  status        public.entry_status not null default 'draft',
  approved_by   uuid references public.profiles (user_id),
  approved_at   timestamptz,
  return_note   text,
  invoice_id    uuid references public.invoices (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint complete_once_submitted check (
    status = 'draft'
    or (project_id is not null and work_type_id is not null
        and hours > 0 and length(btrim(description)) > 0)
  ),
  constraint invoiced_has_invoice check ((status = 'invoiced') = (invoice_id is not null)),
  constraint approved_has_approver check (status not in ('approved', 'invoiced') or approved_by is not null)
);

create index time_entries_user_date_idx    on public.time_entries (user_id, entry_date);
create index time_entries_project_date_idx on public.time_entries (project_id, entry_date);
create index time_entries_status_idx       on public.time_entries (status);
create index time_entries_invoice_idx      on public.time_entries (invoice_id);

-- TimeLog "Rate Override" and the frozen rate. rate_snapshot is written at
-- approval so a later change to the project rate never rewrites history.
create table public.entry_billing (
  entry_id       uuid primary key references public.time_entries (id) on delete cascade,
  rate_override  numeric(10,2) check (rate_override >= 0),
  rate_snapshot  numeric(10,2) check (rate_snapshot >= 0),
  updated_at     timestamptz not null default now()
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  table_name  text not null,
  row_id      text not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index audit_log_row_idx on public.audit_log (table_name, row_id);
create index audit_log_at_idx  on public.audit_log (at desc);

-- ===== migrations/20260918000200_security.sql =====
-- Roles, row-level security, audit trail.
-- employee : own draft/returned entries only; never sees rates, values, invoices.
-- approver : all entries, rates and reports; approves / returns.
-- admin    : approver + staff, projects, settings, invoices, audit log.

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can read profiles without recursing into
-- the profiles policies. An inactive user resolves to no role at all.

create or replace function app.current_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.user_id = auth.uid() and p.is_active
$$;

create or replace function app.is_active()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.current_role() is not null $$;

create or replace function app.is_approver()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app.current_role() in ('approver', 'admin'), false) $$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app.current_role() = 'admin', false) $$;

grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------- housekeeping triggers

create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch before update on public.settings      for each row execute function app.touch_updated_at();
create trigger touch before update on public.profiles      for each row execute function app.touch_updated_at();
create trigger touch before update on public.clients       for each row execute function app.touch_updated_at();
create trigger touch before update on public.projects      for each row execute function app.touch_updated_at();
create trigger touch before update on public.project_rates for each row execute function app.touch_updated_at();
create trigger touch before update on public.invoices      for each row execute function app.touch_updated_at();
create trigger touch before update on public.time_entries  for each row execute function app.touch_updated_at();
create trigger touch before update on public.entry_billing for each row execute function app.touch_updated_at();

-- Every invited auth user gets an employee profile. Role is never taken
-- from user-editable metadata; an admin promotes people afterwards.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Audit: who changed what, before and after.
create or replace function app.audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  pk text := tg_argv[0];
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (old_j - 'updated_at') = (new_j - 'updated_at') then
    return new;
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, before, after)
  values (auth.uid(), tg_table_name, coalesce(new_j ->> pk, old_j ->> pk), tg_op, old_j, new_j);
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on public.settings      for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.profiles      for each row execute function app.audit('user_id');
create trigger audit after insert or update or delete on public.clients       for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.projects      for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.project_rates for each row execute function app.audit('project_id');
create trigger audit after insert or update or delete on public.work_types    for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.invoices      for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.time_entries  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.entry_billing for each row execute function app.audit('entry_id');

-- ---------------------------------------------------------------- grants
-- Nothing is reachable without a login.

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.settings      enable row level security;
alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.projects      enable row level security;
alter table public.project_rates enable row level security;
alter table public.work_types    enable row level security;
alter table public.invoices      enable row level security;
alter table public.time_entries  enable row level security;
alter table public.entry_billing enable row level security;
alter table public.audit_log     enable row level security;

-- settings: everyone signed in reads (standard day, company name); admin edits.
create policy settings_read  on public.settings for select to authenticated using (app.is_active());
create policy settings_admin on public.settings for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- profiles: you see yourself; approvers see the team; only admin changes anyone.
create policy profiles_read  on public.profiles for select to authenticated
  using (user_id = auth.uid() or app.is_approver());
create policy profiles_admin on public.profiles for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- pick-lists: everyone reads, admin writes.
create policy projects_read    on public.projects   for select to authenticated using (app.is_active());
create policy projects_admin   on public.projects   for all    to authenticated using (app.is_admin()) with check (app.is_admin());
create policy work_types_read  on public.work_types for select to authenticated using (app.is_active());
create policy work_types_admin on public.work_types for all    to authenticated using (app.is_admin()) with check (app.is_admin());

-- clients, rates, invoices: invisible to employees.
create policy clients_read   on public.clients       for select to authenticated using (app.is_approver());
create policy clients_admin  on public.clients       for all    to authenticated using (app.is_admin()) with check (app.is_admin());
create policy rates_read     on public.project_rates for select to authenticated using (app.is_approver());
create policy rates_admin    on public.project_rates for all    to authenticated using (app.is_admin()) with check (app.is_admin());
create policy invoices_read  on public.invoices      for select to authenticated using (app.is_approver());
create policy invoices_admin on public.invoices      for update to authenticated using (app.is_admin()) with check (app.is_admin());
-- invoices are inserted / voided only through app.create_invoice / app.void_invoice.

-- time entries: own rows for employees, everything for approvers.
create policy entries_read_own on public.time_entries for select to authenticated
  using (user_id = auth.uid() and app.is_active());
create policy entries_read_all on public.time_entries for select to authenticated
  using (app.is_approver());

create policy entries_insert_own on public.time_entries for insert to authenticated
  with check (
    user_id = auth.uid() and app.is_active()
    and status in ('draft', 'submitted')
    and approved_by is null and approved_at is null and invoice_id is null
  );

-- An employee can touch a row only while it is draft or returned, and can
-- only leave it as draft or submitted.
create policy entries_update_own on public.time_entries for update to authenticated
  using (user_id = auth.uid() and app.is_active() and status in ('draft', 'returned'))
  with check (
    user_id = auth.uid()
    and status in ('draft', 'submitted')
    and approved_by is null and approved_at is null and invoice_id is null
  );

create policy entries_delete_own on public.time_entries for delete to authenticated
  using (user_id = auth.uid() and app.is_active() and status in ('draft', 'returned'));

-- Approvers may enter on behalf of someone and correct any entry that has
-- not been invoiced. Moving a row to "invoiced" only happens inside
-- app.create_invoice.
create policy entries_insert_approver on public.time_entries for insert to authenticated
  with check (app.is_approver() and status <> 'invoiced');
create policy entries_update_approver on public.time_entries for update to authenticated
  using (app.is_approver() and status <> 'invoiced')
  with check (app.is_approver() and status <> 'invoiced');
create policy entries_delete_approver on public.time_entries for delete to authenticated
  using (app.is_approver() and status <> 'invoiced');

-- rate override / snapshot: approvers only.
create policy billing_read  on public.entry_billing for select to authenticated using (app.is_approver());
create policy billing_write on public.entry_billing for all to authenticated
  using (
    app.is_approver()
    and exists (select 1 from public.time_entries e where e.id = entry_id and e.status <> 'invoiced')
  )
  with check (app.is_approver());

create policy audit_read on public.audit_log for select to authenticated using (app.is_admin());

-- ===== migrations/20260918000300_workflow_and_reports.sql =====
-- Workflow functions (approve / return / invoice / void) and the views that
-- replace the workbook report sheets. Business rules are lifted from the
-- TimeLog formulas and the Invoice sheet so totals match to the cent.

-- ---------------------------------------------------------------- entries view
-- TimeLog with Project No, Rate ($/hr) and Value ($) computed as the workbook does:
--   rate  = rate override, else the rate frozen at approval, else the project rate
--   value = 0 when not chargeable, else hours x rate
-- security_invoker: RLS of the caller applies, so an employee sees only their
-- own rows and the rate / value columns come back null for them.
create view public.v_entries
with (security_invoker = true) as
select
  e.id, e.entry_date, e.user_id, p.display_name as employee,
  e.project_id, pr.project_no, pr.name as project, pr.client_id, c.name as client,
  e.work_type_id, w.name as work_type,
  e.chargeable, e.hours, e.description, e.status,
  b.rate_override,
  coalesce(b.rate_override, b.rate_snapshot, r.rate) as rate,
  case
    when not e.chargeable then 0
    else round(e.hours * coalesce(b.rate_override, b.rate_snapshot, r.rate), 2)
  end as value,
  e.approved_by, ap.display_name as approved_by_name, e.approved_at, e.return_note,
  e.invoice_id, i.invoice_no,
  e.created_at, e.updated_at
from public.time_entries e
join      public.profiles      p  on p.user_id = e.user_id
left join public.projects      pr on pr.id = e.project_id
left join public.clients       c  on c.id = pr.client_id
left join public.work_types    w  on w.id = e.work_type_id
left join public.entry_billing b  on b.entry_id = e.id
left join public.project_rates r  on r.project_id = e.project_id
left join public.profiles      ap on ap.user_id = e.approved_by
left join public.invoices      i  on i.id = e.invoice_id;

-- Lists: "N project(s) have no charge-out rate".
create view public.v_projects
with (security_invoker = true) as
select
  pr.*, c.name as client, r.rate,
  (not pr.is_internal and pr.default_chargeable and r.rate is null) as missing_rate
from public.projects pr
left join public.clients       c on c.id = pr.client_id
left join public.project_rates r on r.project_id = pr.id;

-- Summary sheet: Uninvoiced Hours / Uninvoiced Amount per project.
create view public.v_uninvoiced
with (security_invoker = true) as
select project_id, project_no, project, client,
       sum(hours) as hours, sum(value) as amount, count(*) as entries,
       min(entry_date) as first_date, max(entry_date) as last_date
from public.v_entries
where status = 'approved' and chargeable
group by project_id, project_no, project, client;

-- ---------------------------------------------------------------- hours check
-- 2.00 -> "2", 0.50 -> "0.5" (as the workbook prints hours)
create or replace function app.fmt_hours(n numeric)
returns text language sql immutable set search_path = ''
as $$ select rtrim(rtrim(to_char(n, 'FM999990.00'), '0'), '.') $$;
grant execute on function app.fmt_hours(numeric) to authenticated;

-- Hours Check sheet. One row per person per calendar day in the range,
-- including days with nothing entered. Drafts do not count (they have not
-- been "sent"). Weekends are listed but never flagged short.
create or replace function public.hours_check(p_from date, p_to date)
returns table (
  user_id uuid, employee text, day date, is_weekend boolean,
  hours numeric, standard numeric, overtime numeric, status text
)
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  totals as (
    select e.user_id, e.entry_date, sum(e.hours) as hours
    from public.time_entries e
    where e.status <> 'draft' and e.entry_date between p_from and p_to
    group by e.user_id, e.entry_date
  )
  select
    p.user_id, p.display_name, d.day,
    extract(isodow from d.day) >= 6,
    coalesce(t.hours, 0),
    coalesce(p.standard_day_hours, s.standard_day_hours),
    greatest(coalesce(t.hours, 0) - coalesce(p.standard_day_hours, s.standard_day_hours), 0),
    case
      when extract(isodow from d.day) >= 6 then
        case when coalesce(t.hours, 0) > 0 then 'Weekend' else '' end
      when coalesce(t.hours, 0) < coalesce(p.standard_day_hours, s.standard_day_hours) then
        'SHORT by ' || app.fmt_hours(coalesce(p.standard_day_hours, s.standard_day_hours) - coalesce(t.hours, 0)) || ' hrs'
      when coalesce(t.hours, 0) > coalesce(p.standard_day_hours, s.standard_day_hours) then
        'Over by ' || app.fmt_hours(coalesce(t.hours, 0) - coalesce(p.standard_day_hours, s.standard_day_hours)) || ' hrs'
      else 'OK - full day'
    end
  from public.profiles p
  cross join days d
  cross join public.settings s
  left join totals t on t.user_id = p.user_id and t.entry_date = d.day
  where p.is_active and p_to >= p_from and p_to - p_from <= 370
  order by p.display_name, d.day
$$;

-- ---------------------------------------------------------------- period summary
-- Summary sheet: one row per project with activity in the period.
create or replace function public.project_summary(p_from date, p_to date)
returns table (
  project_id uuid, project_no text, project text, client text, rate numeric,
  total_hours numeric, amount numeric, entries bigint,
  hours_by_work_type jsonb, untagged_hours numeric, non_chargeable_hours numeric,
  work_performed text, uninvoiced_hours numeric, uninvoiced_amount numeric
)
language sql stable security invoker set search_path = ''
as $$
  with e as (
    select * from public.v_entries
    where status <> 'draft' and entry_date between p_from and p_to and project_id is not null
  ),
  by_type as (
    select project_id, jsonb_object_agg(work_type, h) as j
    from (select project_id, work_type, sum(hours) as h from e
          where work_type is not null group by project_id, work_type) x
    group by project_id
  )
  select
    e.project_id, e.project_no, e.project, e.client, max(r.rate),
    sum(e.hours), sum(e.value), count(*),
    coalesce((select j from by_type b where b.project_id = e.project_id), '{}'::jsonb),
    coalesce(sum(e.hours) filter (where e.work_type is null), 0),
    coalesce(sum(e.hours) filter (where not e.chargeable), 0),
    string_agg(distinct nullif(btrim(e.description), ''), '; '),
    coalesce(sum(e.hours) filter (where e.chargeable and e.status = 'approved'), 0),
    coalesce(sum(e.value) filter (where e.chargeable and e.status = 'approved'), 0)
  from e
  left join public.project_rates r on r.project_id = e.project_id
  group by e.project_id, e.project_no, e.project, e.client
  order by e.project_no
$$;

-- ---------------------------------------------------------------- approve / return

-- Approve submitted entries and freeze the rate they will be billed at.
create or replace function public.approve_entries(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not app.is_approver() then
    raise exception 'Only an approver can approve entries' using errcode = '42501';
  end if;

  update public.time_entries
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), return_note = null
   where id = any (p_ids) and status = 'submitted';
  get diagnostics n = row_count;

  insert into public.entry_billing (entry_id, rate_snapshot)
  select e.id, r.rate
    from public.time_entries e
    left join public.project_rates r on r.project_id = e.project_id
   where e.id = any (p_ids) and e.status = 'approved'
  on conflict (entry_id) do update
    set rate_snapshot = coalesce(public.entry_billing.rate_snapshot, excluded.rate_snapshot);

  return n;
end $$;

-- Send entries back to the employee with a note.
create or replace function public.return_entries(p_ids uuid[], p_note text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not app.is_approver() then
    raise exception 'Only an approver can return entries' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'A note is required so the person knows what to fix';
  end if;

  update public.time_entries
     set status = 'returned', approved_by = null, approved_at = null, return_note = btrim(p_note)
   where id = any (p_ids) and status in ('submitted', 'approved');
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- invoicing
-- Invoice sheet rules: lines are entries on the project, dated inside the
-- period, chargeable, approved and not yet invoiced.
--   subtotal = sum of values; GST = subtotal x GST rate; total = subtotal + GST
--   due = invoice date + payment terms; numbers run INV-0001, INV-0002, ...
create or replace function public.create_invoice(
  p_project_id uuid, p_from date, p_to date, p_issued_on date default current_date
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  s          public.settings%rowtype;
  v_ids      uuid[];
  v_hours    numeric;
  v_subtotal numeric;
  v_gst      numeric;
  v_no       text;
  v_invoice  uuid;
  v_client   uuid;
begin
  if not app.is_admin() then
    raise exception 'Only an admin can create invoices' using errcode = '42501';
  end if;
  if p_to < p_from then
    raise exception 'Period end is before period start';
  end if;

  -- lock the counter row so two invoices can never share a number
  select * into s from public.settings where id for update;

  select array_agg(e.id) into v_ids
    from public.time_entries e
   where e.project_id = p_project_id and e.entry_date between p_from and p_to
     and e.chargeable and e.status = 'approved' and e.invoice_id is null;

  if v_ids is null then
    raise exception 'No approved, unbilled chargeable time in this period';
  end if;

  -- make sure every line has a frozen rate
  insert into public.entry_billing (entry_id, rate_snapshot)
  select e.id, r.rate
    from public.time_entries e
    left join public.project_rates r on r.project_id = e.project_id
   where e.id = any (v_ids)
  on conflict (entry_id) do update
    set rate_snapshot = coalesce(public.entry_billing.rate_snapshot, excluded.rate_snapshot);

  if exists (
    select 1 from public.time_entries e
    left join public.entry_billing b on b.entry_id = e.id
    where e.id = any (v_ids) and coalesce(b.rate_override, b.rate_snapshot) is null
  ) then
    raise exception 'This project has no charge-out rate. Set one on the project (or a rate override on the entries) first.';
  end if;

  select sum(e.hours), sum(round(e.hours * coalesce(b.rate_override, b.rate_snapshot), 2))
    into v_hours, v_subtotal
    from public.time_entries e
    join public.entry_billing b on b.entry_id = e.id
   where e.id = any (v_ids);

  v_gst := round(v_subtotal * s.gst_rate, 2);
  v_no  := s.invoice_prefix || lpad(s.next_invoice_no::text, 4, '0');
  select client_id into v_client from public.projects where id = p_project_id;

  insert into public.invoices (
    invoice_no, project_id, client_id, period_from, period_to, issued_on, due_on,
    total_hours, subtotal, gst_rate, gst, total, created_by
  ) values (
    v_no, p_project_id, v_client, p_from, p_to, p_issued_on, p_issued_on + s.payment_terms_days,
    v_hours, v_subtotal, s.gst_rate, v_gst, v_subtotal + v_gst, auth.uid()
  ) returning id into v_invoice;

  update public.time_entries set status = 'invoiced', invoice_id = v_invoice where id = any (v_ids);
  update public.settings set next_invoice_no = next_invoice_no + 1 where id;

  return v_invoice;
end $$;

-- Void an invoice and release its lines back to "approved" so they can be
-- billed again. The number is never reused.
create or replace function public.void_invoice(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Only an admin can void invoices' using errcode = '42501';
  end if;
  if not exists (select 1 from public.invoices where id = p_invoice_id and status <> 'void') then
    raise exception 'Invoice not found or already void';
  end if;

  update public.time_entries set status = 'approved', invoice_id = null where invoice_id = p_invoice_id;
  update public.invoices set status = 'void' where id = p_invoice_id;
end $$;

revoke all on function public.hours_check(date, date)                 from public, anon;
revoke all on function public.project_summary(date, date)             from public, anon;
revoke all on function public.approve_entries(uuid[])                 from public, anon;
revoke all on function public.return_entries(uuid[], text)            from public, anon;
revoke all on function public.create_invoice(uuid, date, date, date)  from public, anon;
revoke all on function public.void_invoice(uuid)                      from public, anon;
grant execute on function public.hours_check(date, date)                to authenticated;
grant execute on function public.project_summary(date, date)            to authenticated;
grant execute on function public.approve_entries(uuid[])                to authenticated;
grant execute on function public.return_entries(uuid[], text)           to authenticated;
grant execute on function public.create_invoice(uuid, date, date, date) to authenticated;
grant execute on function public.void_invoice(uuid)                     to authenticated;

revoke all on public.v_entries, public.v_projects, public.v_uninvoiced from anon;
grant select on public.v_entries, public.v_projects, public.v_uninvoiced to authenticated;

-- ===== migrations/20260918000400_seed_lists.sql =====
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

-- ===== migrations/20260918000500_public_holidays.sql =====
-- Public holidays: the Hours Check no longer flags them as short days.
-- Seeded with NZ national holidays plus Auckland Anniversary Day (the office
-- is in Botany), on their observed (Mondayised) dates, 2025-2028.
-- Admins can add, rename or remove days under Setup -> Public holidays.

create table public.public_holidays (
  day         date primary key,
  name        text not null check (length(btrim(name)) > 0),
  created_at  timestamptz not null default now()
);

alter table public.public_holidays enable row level security;
revoke all on public.public_holidays from anon;
grant select, insert, update, delete on public.public_holidays to authenticated;

create policy holidays_read  on public.public_holidays for select to authenticated using (app.is_active());
create policy holidays_admin on public.public_holidays for all    to authenticated using (app.is_admin()) with check (app.is_admin());

create trigger audit after insert or update or delete on public.public_holidays
  for each row execute function app.audit('day');

insert into public.public_holidays (day, name) values
  ('2025-01-01', 'New Year''s Day'),
  ('2025-01-02', 'Day after New Year''s Day'),
  ('2025-01-27', 'Auckland Anniversary Day'),
  ('2025-02-06', 'Waitangi Day'),
  ('2025-04-18', 'Good Friday'),
  ('2025-04-21', 'Easter Monday'),
  ('2025-04-25', 'ANZAC Day'),
  ('2025-06-02', 'King''s Birthday'),
  ('2025-06-20', 'Matariki'),
  ('2025-10-27', 'Labour Day'),
  ('2025-12-25', 'Christmas Day'),
  ('2025-12-26', 'Boxing Day'),
  ('2026-01-01', 'New Year''s Day'),
  ('2026-01-02', 'Day after New Year''s Day'),
  ('2026-01-26', 'Auckland Anniversary Day'),
  ('2026-02-06', 'Waitangi Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-06', 'Easter Monday'),
  ('2026-04-27', 'ANZAC Day (observed)'),
  ('2026-06-01', 'King''s Birthday'),
  ('2026-07-10', 'Matariki'),
  ('2026-10-26', 'Labour Day'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-28', 'Boxing Day (observed)'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-01-04', 'Day after New Year''s Day (observed)'),
  ('2027-02-01', 'Auckland Anniversary Day'),
  ('2027-02-08', 'Waitangi Day (observed)'),
  ('2027-03-26', 'Good Friday'),
  ('2027-03-29', 'Easter Monday'),
  ('2027-04-26', 'ANZAC Day (observed)'),
  ('2027-06-07', 'King''s Birthday'),
  ('2027-06-25', 'Matariki'),
  ('2027-10-25', 'Labour Day'),
  ('2027-12-27', 'Christmas Day (observed)'),
  ('2027-12-28', 'Boxing Day (observed)'),
  ('2028-01-03', 'New Year''s Day (observed)'),
  ('2028-01-04', 'Day after New Year''s Day (observed)'),
  ('2028-01-31', 'Auckland Anniversary Day'),
  ('2028-02-07', 'Waitangi Day (observed)'),
  ('2028-04-14', 'Good Friday'),
  ('2028-04-17', 'Easter Monday'),
  ('2028-04-25', 'ANZAC Day'),
  ('2028-06-05', 'King''s Birthday'),
  ('2028-07-14', 'Matariki'),
  ('2028-10-23', 'Labour Day'),
  ('2028-12-25', 'Christmas Day'),
  ('2028-12-26', 'Boxing Day')
on conflict (day) do nothing;

-- Hours Check, now holiday-aware. A public holiday behaves like a weekend:
-- listed, never flagged short, and any time worked on it is shown.
-- (Return type changes, so the old function has to be dropped first.)
drop function if exists public.hours_check(date, date);

create function public.hours_check(p_from date, p_to date)
returns table (
  user_id uuid, employee text, day date, is_weekend boolean, holiday text,
  hours numeric, standard numeric, overtime numeric, status text
)
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  totals as (
    select e.user_id, e.entry_date, sum(e.hours) as hours
    from public.time_entries e
    where e.status <> 'draft' and e.entry_date between p_from and p_to
    group by e.user_id, e.entry_date
  ),
  grid as (
    select
      p.user_id, p.display_name, d.day,
      extract(isodow from d.day) >= 6 as is_weekend,
      h.name as holiday,
      coalesce(t.hours, 0) as hours,
      coalesce(p.standard_day_hours, s.standard_day_hours) as standard
    from public.profiles p
    cross join days d
    cross join public.settings s
    left join public.public_holidays h on h.day = d.day
    left join totals t on t.user_id = p.user_id and t.entry_date = d.day
    where p.is_active and p_to >= p_from and p_to - p_from <= 370
  )
  select
    g.user_id, g.display_name, g.day, g.is_weekend, g.holiday, g.hours, g.standard,
    case when g.is_weekend or g.holiday is not null then g.hours
         else greatest(g.hours - g.standard, 0) end,
    case
      when g.holiday is not null then
        'Public holiday' || case when g.hours > 0 then ' - worked ' || app.fmt_hours(g.hours) || ' hrs' else '' end
      when g.is_weekend then
        case when g.hours > 0 then 'Weekend' else '' end
      when g.hours < g.standard then 'SHORT by ' || app.fmt_hours(g.standard - g.hours) || ' hrs'
      when g.hours > g.standard then 'Over by ' || app.fmt_hours(g.hours - g.standard) || ' hrs'
      else 'OK - full day'
    end
  from grid g
  order by g.display_name, g.day
$$;

revoke all on function public.hours_check(date, date) from public, anon;
grant execute on function public.hours_check(date, date) to authenticated;

-- ===== migrations/20260921000600_rate_limits.sql =====
-- Shared rate-limit counters, so limits hold across every server instance.
-- Only the server (service role) can touch this; signed-in users and the
-- public key cannot read, write or call it. Keys are hashed by the app, so no
-- email address or IP is stored here in the clear.

create table if not exists public.rate_limits (
  key           text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 1,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;   -- and no policies: nobody gets in through the API
revoke all on public.rate_limits from anon, authenticated;

-- Count one hit for p_key in the current fixed window; true = still allowed.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count  integer;
begin
  insert into public.rate_limits as r (key, window_start)
  values (left(p_key, 200), v_window)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- tidy up roughly once every hundred calls
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ===== migrations/20260922000700_external_invoices.sql =====
-- Time that was billed somewhere other than the portal (Xero, Word, ...).
-- The workbook allowed this by typing "Invoiced? = Yes" and any invoice number
-- on the rows. Here it is recorded as an invoice flagged is_external, so the
-- time leaves "ready to invoice", stays locked, shows its invoice number
-- everywhere, and can be released again by voiding, exactly like a portal invoice.

alter table public.invoices add column if not exists is_external boolean not null default false;

create or replace function public.record_external_invoice(
  p_project_id uuid, p_from date, p_to date, p_invoice_no text, p_issued_on date default current_date
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  s          public.settings%rowtype;
  v_no       text := btrim(coalesce(p_invoice_no, ''));
  v_ids      uuid[];
  v_hours    numeric;
  v_subtotal numeric;
  v_gst      numeric;
  v_invoice  uuid;
  v_client   uuid;
begin
  if not app.is_admin() then
    raise exception 'Only an admin can record invoices' using errcode = '42501';
  end if;
  if v_no = '' or length(v_no) > 40 then
    raise exception 'Enter the invoice number (up to 40 characters)';
  end if;
  if p_to < p_from then
    raise exception 'Period end is before period start';
  end if;
  if exists (select 1 from public.invoices where invoice_no = v_no) then
    raise exception 'An invoice numbered % is already recorded', v_no;
  end if;

  select * into s from public.settings where id;

  -- same selection rule as create_invoice
  select array_agg(e.id) into v_ids
    from public.time_entries e
   where e.project_id = p_project_id and e.entry_date between p_from and p_to
     and e.chargeable and e.status = 'approved' and e.invoice_id is null;

  if v_ids is null then
    raise exception 'No approved, unbilled chargeable time in this period';
  end if;

  -- freeze whatever rate is known; unlike a portal invoice a missing rate does
  -- not block this, because the real amounts live in the other system
  insert into public.entry_billing (entry_id, rate_snapshot)
  select e.id, r.rate
    from public.time_entries e
    left join public.project_rates r on r.project_id = e.project_id
   where e.id = any (v_ids)
  on conflict (entry_id) do update
    set rate_snapshot = coalesce(public.entry_billing.rate_snapshot, excluded.rate_snapshot);

  select sum(e.hours), coalesce(sum(round(e.hours * coalesce(b.rate_override, b.rate_snapshot, 0), 2)), 0)
    into v_hours, v_subtotal
    from public.time_entries e
    left join public.entry_billing b on b.entry_id = e.id
   where e.id = any (v_ids);

  v_gst := round(v_subtotal * s.gst_rate, 2);
  select client_id into v_client from public.projects where id = p_project_id;

  insert into public.invoices (
    invoice_no, project_id, client_id, period_from, period_to, issued_on, due_on,
    total_hours, subtotal, gst_rate, gst, total, status, is_external, created_by
  ) values (
    v_no, p_project_id, v_client, p_from, p_to, p_issued_on, p_issued_on + s.payment_terms_days,
    v_hours, v_subtotal, s.gst_rate, v_gst, v_subtotal + v_gst, 'sent', true, auth.uid()
  ) returning id into v_invoice;

  update public.time_entries set status = 'invoiced', invoice_id = v_invoice where id = any (v_ids);
  -- the portal's own invoice counter is deliberately left alone

  return v_invoice;
end $$;

revoke all on function public.record_external_invoice(uuid, date, date, text, date) from public, anon;
grant execute on function public.record_external_invoice(uuid, date, date, text, date) to authenticated;

commit;
