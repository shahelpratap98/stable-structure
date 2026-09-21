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
