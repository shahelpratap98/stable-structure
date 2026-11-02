-- Structural design app, stage 4: review and CPEng sign-off.
--
-- Flow: draft -> in_review (designer submits, naming a CPEng checker) ->
-- signed (the checker signs the exact revision they reviewed). The checker,
-- the designer or an admin can send a job under review back to draft. Only
-- an admin can reopen a signed job. Every step is a function below; the
-- guard trigger stops status and sign-off fields being changed any other way.
--
-- Which staff are Chartered Professional Engineers is kept in
-- design_engineers (admin managed), not on profiles, so the timesheet side
-- of the portal is untouched.

create table public.design_engineers (
  user_id       uuid primary key references public.profiles (user_id) on delete cascade,
  cpeng_number  text not null check (length(btrim(cpeng_number)) between 1 and 20),
  created_at    timestamptz not null default now()
);

alter table public.design_jobs
  add column designer_id     uuid references public.profiles (user_id),
  add column checker_id      uuid references public.profiles (user_id),
  add column submitted_at    timestamptz,
  add column signed_by       uuid references public.profiles (user_id),
  add column signed_at       timestamptz,
  add column signed_revision integer,
  add column review_note     text not null default '' check (length(review_note) <= 1000);

-- ---------------------------------------------------------------- helpers

create or replace function app.is_cpeng()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.is_active() and exists (select 1 from public.design_engineers e where e.user_id = auth.uid()) $$;

-- Active staff and their CPEng numbers, for picking a designer and checker.
-- (Employees can't read other people's profiles directly.)
create or replace function public.design_people()
returns table (user_id uuid, display_name text, cpeng_number text)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.display_name, e.cpeng_number
    from public.profiles p
    left join public.design_engineers e on e.user_id = p.user_id
   where p.is_active and app.is_active()
   order by p.display_name
$$;

-- Status and sign-off fields only change inside the functions below, which
-- set app.design_flow for their own transaction.
create or replace function app.design_job_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.design_flow', true), '') <> 'on'
     and (old.status, old.designer_id, old.checker_id, old.submitted_at, old.signed_by, old.signed_at, old.signed_revision, old.review_note)
         is distinct from (new.status, new.designer_id, new.checker_id, new.submitted_at, new.signed_by, new.signed_at, new.signed_revision, new.review_note) then
    raise exception 'design status changes go through submit, return, sign and reopen' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard before update on public.design_jobs for each row execute function app.design_job_guard();

-- The audit log now covers who reviewed and signed.
create or replace function app.design_job_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (old.job_no, old.title, old.address, old.project_id, old.status, old.designer_id, old.checker_id, old.signed_by, old.signed_revision, old.review_note)
         is not distinct from (new.job_no, new.title, new.address, new.project_id, new.status, new.designer_id, new.checker_id, new.signed_by, new.signed_revision, new.review_note) then
    return null;
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, before, after)
  values (
    auth.uid(), 'design_jobs', coalesce(new.id, old.id)::text, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) - 'model' end,
    case when tg_op <> 'DELETE' then to_jsonb(new) - 'model' end
  );
  return null;
end $$;

-- ---------------------------------------------------------------- flow

-- Designer submits a draft for checking by a CPEng (not themselves).
create or replace function public.submit_design(p_job uuid, p_designer uuid, p_checker uuid, p_note text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.design_jobs;
begin
  if not app.is_active() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v from public.design_jobs where id = p_job for update;
  if not found then raise exception 'design job not found'; end if;
  if v.status <> 'draft' then raise exception 'design_not_draft'; end if;
  if v.revision = 0 then raise exception 'design_empty'; end if;
  if not exists (select 1 from public.profiles where user_id = p_designer and is_active) then raise exception 'designer must be active staff'; end if;
  if not exists (select 1 from public.design_engineers e join public.profiles p using (user_id) where e.user_id = p_checker and p.is_active) then
    raise exception 'checker must be a CPEng';
  end if;
  if p_checker = p_designer then raise exception 'checker must be someone other than the designer'; end if;
  perform set_config('app.design_flow', 'on', true);
  update public.design_jobs
     set status = 'in_review', designer_id = p_designer, checker_id = p_checker, submitted_at = now(),
         review_note = left(coalesce(p_note, ''), 1000)
   where id = p_job;
  perform set_config('app.design_flow', '', true);
end $$;

-- Back to draft from review: the checker (with comments), the designer or an admin.
create or replace function public.return_design(p_job uuid, p_note text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.design_jobs;
begin
  if not app.is_active() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v from public.design_jobs where id = p_job for update;
  if not found then raise exception 'design job not found'; end if;
  if v.status <> 'in_review' then raise exception 'design_not_in_review'; end if;
  if auth.uid() is distinct from v.checker_id and auth.uid() is distinct from v.designer_id and not app.is_admin() then
    raise exception 'only the checker, the designer or an admin can do that' using errcode = '42501';
  end if;
  perform set_config('app.design_flow', 'on', true);
  update public.design_jobs set status = 'draft', submitted_at = null, review_note = left(coalesce(p_note, ''), 1000) where id = p_job;
  perform set_config('app.design_flow', '', true);
end $$;

-- The named checker signs the revision they reviewed. Raises design_conflict
-- if the model has been saved since they loaded it.
create or replace function public.sign_design(p_job uuid, p_expected integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.design_jobs;
begin
  if not app.is_cpeng() then raise exception 'only a CPEng can sign' using errcode = '42501'; end if;
  select * into v from public.design_jobs where id = p_job for update;
  if not found then raise exception 'design job not found'; end if;
  if v.status <> 'in_review' then raise exception 'design_not_in_review'; end if;
  if auth.uid() is distinct from v.checker_id then raise exception 'only the named checker can sign' using errcode = '42501'; end if;
  if v.revision <> p_expected then raise exception 'design_conflict'; end if;
  perform set_config('app.design_flow', 'on', true);
  update public.design_jobs
     set status = 'signed', signed_by = auth.uid(), signed_at = now(), signed_revision = v.revision
   where id = p_job;
  perform set_config('app.design_flow', '', true);
end $$;

-- Admin reopens a signed job (for a revision). The old signature stays in
-- the audit log; the job needs signing again.
create or replace function public.reopen_design(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.design_jobs;
begin
  if not app.is_admin() then raise exception 'only an admin can reopen a signed design' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'give a reason for reopening'; end if;
  select * into v from public.design_jobs where id = p_job for update;
  if not found then raise exception 'design job not found'; end if;
  if v.status <> 'signed' then raise exception 'design_not_signed'; end if;
  perform set_config('app.design_flow', 'on', true);
  update public.design_jobs
     set status = 'draft', submitted_at = null, signed_by = null, signed_at = null, signed_revision = null,
         review_note = left('Reopened: ' || btrim(p_reason), 1000)
   where id = p_job;
  perform set_config('app.design_flow', '', true);
end $$;

-- ---------------------------------------------------------------- security

alter table public.design_engineers enable row level security;
create policy design_engineers_read  on public.design_engineers for select to authenticated using (app.is_active());
create policy design_engineers_admin on public.design_engineers for all to authenticated using (app.is_admin()) with check (app.is_admin());
revoke all on public.design_engineers from anon;
grant select, insert, update, delete on public.design_engineers to authenticated;

revoke all on function app.is_cpeng() from public, anon;
grant execute on function app.is_cpeng() to authenticated;
revoke all on function app.design_job_guard() from public, anon;
revoke all on function public.design_people() from public, anon;
revoke all on function public.submit_design(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.return_design(uuid, text) from public, anon;
revoke all on function public.sign_design(uuid, integer) from public, anon;
revoke all on function public.reopen_design(uuid, text) from public, anon;
grant execute on function public.design_people() to authenticated;
grant execute on function public.submit_design(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.return_design(uuid, text) to authenticated;
grant execute on function public.sign_design(uuid, integer) to authenticated;
grant execute on function public.reopen_design(uuid, text) to authenticated;
