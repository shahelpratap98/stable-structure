-- Structural design app (BedRock IT quotation BRIT-2610-001).
--
-- One design job per structure. The whole structural model (levels, plan
-- placement, members and their properties) is one jsonb document on the job,
-- saved by the editor through public.save_design(). Every save is kept in
-- design_revisions, which is the change history ("every change recorded")
-- and lets a job be rolled back.
--
-- The architect's PDF plans are kept in the private storage bucket
-- "design-plans"; design_plans records each upload.
--
-- Access: every active staff member can read and edit design jobs (the
-- engineers are mostly "employee" role). Deleting a job is admin only. A
-- signed job can no longer be saved (sign-off itself arrives in stage 4).

create type public.design_status as enum ('draft', 'in_review', 'signed');

create table public.design_jobs (
  id          uuid primary key default gen_random_uuid(),
  job_no      text not null default '' check (length(job_no) <= 40),
  title       text not null check (length(btrim(title)) between 1 and 200),
  address     text not null default '' check (length(address) <= 300),
  project_id  uuid references public.projects (id) on delete set null,
  status      public.design_status not null default 'draft',
  model       jsonb not null default '{}'::jsonb,
  revision    integer not null default 0 check (revision >= 0),
  member_count integer generated always as (
    case when jsonb_typeof(model -> 'members') = 'array' then jsonb_array_length(model -> 'members') else 0 end
  ) stored,
  created_by  uuid references public.profiles (user_id) default auth.uid(),
  updated_by  uuid references public.profiles (user_id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 2 MB is far beyond any house; it stops a runaway client filling the database.
  check (pg_column_size(model) < 2000000)
);
create index design_jobs_updated_idx on public.design_jobs (updated_at desc);
create index design_jobs_project_idx on public.design_jobs (project_id);

create table public.design_revisions (
  id        bigint generated always as identity primary key,
  job_id    uuid not null references public.design_jobs (id) on delete cascade,
  revision  integer not null,
  model     jsonb not null,
  summary   text not null default '' check (length(summary) <= 300),
  saved_by  uuid references public.profiles (user_id) default auth.uid(),
  saved_at  timestamptz not null default now(),
  unique (job_id, revision)
);

create table public.design_plans (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.design_jobs (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null check (length(btrim(file_name)) between 1 and 200),
  page_count    integer not null default 1 check (page_count between 1 and 500),
  uploaded_by   uuid references public.profiles (user_id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index design_plans_job_idx on public.design_plans (job_id);

create trigger touch before update on public.design_jobs for each row execute function app.touch_updated_at();

-- Job details (not the model, which lives in design_revisions) go in the audit log.
create or replace function app.design_job_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (old.job_no, old.title, old.address, old.project_id, old.status)
         is not distinct from (new.job_no, new.title, new.address, new.project_id, new.status) then
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
create trigger audit after insert or update or delete on public.design_jobs
  for each row execute function app.design_job_audit();

-- ---------------------------------------------------------------- saving

-- Save the model if nobody else has saved since the editor loaded it.
-- Returns the new revision number; raises 'design_conflict' when the job has
-- moved on (the editor then offers to reload) and 'design_signed' once signed.
create or replace function public.save_design(p_job uuid, p_expected integer, p_model jsonb, p_summary text default '')
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_status public.design_status;
  v_revision integer;
  v_next integer;
begin
  if not app.is_active() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_model) is distinct from 'object' then
    raise exception 'model must be an object';
  end if;

  select status into v_status from public.design_jobs where id = p_job;
  if not found then
    raise exception 'design job not found';
  end if;
  if v_status = 'signed' then
    raise exception 'design_signed';
  end if;
  -- Lock the row; the update policy hides it if it was signed meanwhile.
  select revision into v_revision from public.design_jobs where id = p_job for update;
  if not found then
    raise exception 'design_signed';
  end if;
  if v_revision <> p_expected then
    raise exception 'design_conflict';
  end if;

  v_next := v_revision + 1;
  update public.design_jobs
     set model = p_model, revision = v_next, updated_by = auth.uid()
   where id = p_job;
  insert into public.design_revisions (job_id, revision, model, summary)
  values (p_job, v_next, p_model, left(coalesce(p_summary, ''), 300));
  return v_next;
end $$;

-- ---------------------------------------------------------------- security

alter table public.design_jobs      enable row level security;
alter table public.design_revisions enable row level security;
alter table public.design_plans     enable row level security;

create policy design_jobs_read   on public.design_jobs for select to authenticated using (app.is_active());
create policy design_jobs_insert on public.design_jobs for insert to authenticated with check (app.is_active());
-- Signed jobs are frozen for everyone but an admin (who may reopen one).
create policy design_jobs_update on public.design_jobs for update to authenticated
  using (app.is_active() and (status <> 'signed' or app.is_admin()))
  with check (app.is_active());
create policy design_jobs_delete on public.design_jobs for delete to authenticated using (app.is_admin());

create policy design_revisions_read   on public.design_revisions for select to authenticated using (app.is_active());
create policy design_revisions_insert on public.design_revisions for insert to authenticated with check (app.is_active());

create policy design_plans_read   on public.design_plans for select to authenticated using (app.is_active());
create policy design_plans_insert on public.design_plans for insert to authenticated with check (app.is_active());
create policy design_plans_delete on public.design_plans for delete to authenticated using (app.is_active());

revoke all on public.design_jobs, public.design_revisions, public.design_plans from anon;
grant select, insert, update, delete on public.design_jobs to authenticated;
grant select, insert on public.design_revisions to authenticated;
grant select, insert, delete on public.design_plans to authenticated;

revoke all on function public.save_design(uuid, integer, jsonb, text) from public, anon;
grant execute on function public.save_design(uuid, integer, jsonb, text) to authenticated;
revoke all on function app.design_job_audit() from public, anon;

-- ---------------------------------------------------------------- plan storage

-- Private bucket, PDFs only, 50 MB each. Objects are stored as <job id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-plans', 'design-plans', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy design_plans_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'design-plans' and app.is_active());
create policy design_plans_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'design-plans' and app.is_active());
create policy design_plans_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'design-plans' and app.is_active());
