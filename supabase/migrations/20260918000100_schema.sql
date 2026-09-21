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
