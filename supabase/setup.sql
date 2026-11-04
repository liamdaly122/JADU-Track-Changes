-- Leeds prototyping CMS: cloud saving and sharing
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- Safe to run again: it only creates what is missing and replaces the functions and policies.
--
-- What it sets up
--   projects          one row per project: site settings, pages and sections as one JSON document
--   project_members   who else can open a project, as viewer or editor (the owner is on the project row)
--   project_history   an hourly copy of each project, last 48 kept, so a bad save can be undone
--   cms-media         a private storage bucket for images, one folder per project
-- Row-level security means each signed-in person only sees projects they own or that were shared with them.

-- ---------------------------------------------------------------- tables

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled project',
  data        jsonb not null default '{}'::jsonb,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users (id) on delete set null
);

create table if not exists public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('viewer', 'editor')),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on public.project_members (user_id);

create table if not exists public.project_history (
  id          bigserial primary key,
  project_id  uuid not null references public.projects (id) on delete cascade,
  version     integer not null,
  name        text,
  data        jsonb not null,
  saved_at    timestamptz not null default now(),
  saved_by    uuid references auth.users (id) on delete set null
);
create index if not exists project_history_project_idx on public.project_history (project_id, saved_at desc);

alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.project_history enable row level security;

-- ---------------------------------------------------------------- access helpers
-- security definer: they read the tables directly, so policies can call them without recursion

create or replace function public.can_read_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and owner = auth.uid())
      or exists (select 1 from public.project_members where project_id = p and user_id = auth.uid());
$$;

create or replace function public.can_edit_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and owner = auth.uid())
      or exists (select 1 from public.project_members where project_id = p and user_id = auth.uid() and role = 'editor');
$$;

create or replace function public.is_project_owner(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and owner = auth.uid());
$$;

-- storage paths look like "<project id>/<image id>"
create or replace function public.can_read_media(object_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare pid text := split_part(object_name, '/', 1);
begin
  if pid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.can_read_project(pid::uuid);
end $$;

create or replace function public.can_edit_media(object_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare pid text := split_part(object_name, '/', 1);
begin
  if pid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.can_edit_project(pid::uuid);
end $$;

-- ---------------------------------------------------------------- triggers

-- new projects always belong to whoever creates them
create or replace function public.projects_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  new.owner      := auth.uid();
  new.version    := 1;
  new.created_at := now();
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- every save bumps the version (the app uses it to spot a colleague's newer save),
-- keeps the owner fixed, and copies the previous state into history at most once an hour
create or replace function public.projects_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id         := old.id;
  new.owner      := old.owner;
  new.created_at := old.created_at;
  new.version    := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.data is distinct from old.data
     and not exists (select 1 from public.project_history
                     where project_id = old.id and saved_at > now() - interval '1 hour') then
    insert into public.project_history (project_id, version, name, data, saved_by)
      values (old.id, old.version, old.name, old.data, old.updated_by);
    delete from public.project_history
      where project_id = old.id
        and id not in (select id from public.project_history where project_id = old.id order by saved_at desc limit 48);
  end if;
  return new;
end $$;

drop trigger if exists projects_before_insert on public.projects;
create trigger projects_before_insert before insert on public.projects
  for each row execute function public.projects_before_insert();

drop trigger if exists projects_before_update on public.projects;
create trigger projects_before_update before update on public.projects
  for each row execute function public.projects_before_update();

-- ---------------------------------------------------------------- policies

drop policy if exists "read own or shared projects" on public.projects;
create policy "read own or shared projects" on public.projects
  for select to authenticated using (public.can_read_project(id));

drop policy if exists "create own projects" on public.projects;
create policy "create own projects" on public.projects
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "edit as owner or editor" on public.projects;
create policy "edit as owner or editor" on public.projects
  for update to authenticated using (public.can_edit_project(id)) with check (public.can_edit_project(id));

drop policy if exists "delete as owner" on public.projects;
create policy "delete as owner" on public.projects
  for delete to authenticated using (owner = auth.uid());

-- membership rows are read here and changed only through the functions below
drop policy if exists "see members of my projects" on public.project_members;
create policy "see members of my projects" on public.project_members
  for select to authenticated using (public.can_read_project(project_id));

drop policy if exists "see history of my projects" on public.project_history;
create policy "see history of my projects" on public.project_history
  for select to authenticated using (public.can_read_project(project_id));

grant select, insert, update, delete on public.projects to authenticated;
grant select on public.project_members, public.project_history to authenticated;
revoke all on public.projects, public.project_members, public.project_history from anon;

-- ---------------------------------------------------------------- functions the app calls

-- projects I own or that are shared with me, without the (large) data column
create or replace function public.my_projects()
returns table (id uuid, name text, role text, owner_email text, version integer, updated_at timestamptz, updated_by_email text)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.name,
         case when p.owner = auth.uid() then 'owner' else m.role end,
         ou.email::text, p.version, p.updated_at, uu.email::text
  from public.projects p
  left join public.project_members m on m.project_id = p.id and m.user_id = auth.uid()
  join auth.users ou on ou.id = p.owner
  left join auth.users uu on uu.id = p.updated_by
  where p.owner = auth.uid() or m.user_id is not null
  order by p.updated_at desc;
$$;

create or replace function public.project_member_list(p_project uuid)
returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = public, auth as $$
  select p.owner, u.email::text, 'owner'::text
    from public.projects p join auth.users u on u.id = p.owner
   where p.id = p_project and public.can_read_project(p_project)
  union all
  select m.user_id, u.email::text, m.role
    from public.project_members m join auth.users u on u.id = m.user_id
   where m.project_id = p_project and public.can_read_project(p_project);
$$;

create or replace function public.share_project(p_project uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if p_role not in ('viewer', 'editor') then raise exception 'Role must be viewer or editor'; end if;
  if not public.is_project_owner(p_project) then raise exception 'Only the owner can share this project'; end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No account for %. The admin needs to add them in Supabase (Authentication, Users) first.', p_email;
  end if;
  if uid = auth.uid() then raise exception 'You already own this project'; end if;
  insert into public.project_members (project_id, user_id, role) values (p_project, uid, p_role)
    on conflict (project_id, user_id) do update set role = excluded.role;
end $$;

create or replace function public.unshare_project(p_project uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_project_owner(p_project) or p_user = auth.uid()) then
    raise exception 'Only the owner can remove people';
  end if;
  delete from public.project_members where project_id = p_project and user_id = p_user;
end $$;

-- the hourly copies of a project, newest first, without their data
create or replace function public.project_history_list(p_project uuid)
returns table (id bigint, version integer, saved_at timestamptz, saved_by_email text)
language sql stable security definer set search_path = public, auth as $$
  select h.id, h.version, h.saved_at, u.email::text
    from public.project_history h left join auth.users u on u.id = h.saved_by
   where h.project_id = p_project and public.can_read_project(p_project)
   order by h.saved_at desc;
$$;

revoke execute on function public.my_projects(), public.project_member_list(uuid), public.share_project(uuid, text, text),
  public.unshare_project(uuid, uuid), public.project_history_list(uuid) from public, anon;
grant execute on function public.my_projects(), public.project_member_list(uuid), public.share_project(uuid, text, text),
  public.unshare_project(uuid, uuid), public.project_history_list(uuid) to authenticated;

-- ---------------------------------------------------------------- image storage

insert into storage.buckets (id, name, public, file_size_limit)
  values ('cms-media', 'cms-media', false, 10485760)
  on conflict (id) do nothing;

drop policy if exists "cms media read" on storage.objects;
create policy "cms media read" on storage.objects
  for select to authenticated using (bucket_id = 'cms-media' and public.can_read_media(name));

drop policy if exists "cms media upload" on storage.objects;
create policy "cms media upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'cms-media' and public.can_edit_media(name));

drop policy if exists "cms media replace" on storage.objects;
create policy "cms media replace" on storage.objects
  for update to authenticated using (bucket_id = 'cms-media' and public.can_edit_media(name))
  with check (bucket_id = 'cms-media' and public.can_edit_media(name));

drop policy if exists "cms media delete" on storage.objects;
create policy "cms media delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cms-media' and public.can_edit_media(name));

-- Done. Next: Authentication > Users > Add user, for yourself and each colleague (tick "Auto Confirm User").
