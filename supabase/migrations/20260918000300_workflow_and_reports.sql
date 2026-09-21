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
