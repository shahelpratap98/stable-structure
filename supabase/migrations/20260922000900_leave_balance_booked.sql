-- Fix: approved leave that has not started yet must come off the balance too,
-- otherwise "days left" stays at 20 after booking a holiday next month.
-- The balance is now "accrued to today, minus everything approved" (past and
-- future), which is what people mean by "how many days have I got left".

create or replace function app.leave_balance(p_user uuid, p_type public.leave_type, p_on date)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare
  p        public.profiles%rowtype;
  s        public.settings%rowtype;
  ent      numeric;
  cap      numeric;
  bal      numeric;
  as_of    date;
  ev       record;
begin
  select * into p from public.profiles where user_id = p_user;
  select * into s from public.settings where id;
  if p_type = 'annual' then
    ent := coalesce(p.annual_leave_days, s.annual_leave_days); cap := null;
    bal := p.annual_opening_days;
  else
    ent := coalesce(p.sick_leave_days, s.sick_leave_days); cap := s.sick_leave_cap_days;
    bal := p.sick_opening_days;
  end if;

  as_of := p.balance_as_of;
  if as_of is null or bal is null then
    as_of := app.leave_year_start(p_user, p_on);
    bal   := ent;
  end if;

  for ev in
    -- accruals: each anniversary after the opening date, up to today
    select d as at, ent as delta from (
      select (case when p.start_date is null
                   then make_date(extract(year from p.balance_as_of)::int + n, 1, 1)
                   else (p.start_date + (n || ' years')::interval)::date end) as d
      from generate_series(0, 60) n
    ) a where d > as_of and d <= p_on and p.balance_as_of is not null and bal is not null
    union all
    -- deductions: every approved request from the opening date on, including future ones
    select l.start_date, -l.days from public.leave_requests l
     where l.user_id = p_user and l.leave_type = p_type and l.status = 'approved'
       and l.start_date >= as_of
    order by 1
  loop
    bal := bal + ev.delta;
    if cap is not null and ev.delta > 0 then bal := least(bal, cap); end if;
  end loop;
  return bal;
end $$;
