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
