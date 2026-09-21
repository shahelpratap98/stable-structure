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
