-- Leeds prototyping CMS: cloud saving and sharing
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- Safe to run again: it only creates what is missing and replaces the functions and policies.
--
-- What it sets up
--   projects          one row per project: site settings, pages and sections as one JSON document
--   project_members   who else can open a project, as viewer or editor (the owner is on the project row)
--   project_history   an hourly copy of each project, last 48 kept, so a bad save can be undone
--   cms-media         a private storage bucket for images, one folder per project
--   page_comments     comments on a page or one of its blocks
--   page_signoffs     every sign-off step for a page (in review, changes requested, approved) with who and when
--   share_links       read-only review links: a fixed copy of the project, a section or a page
--   cms-shares        a public storage bucket for the images in review links, one folder per link
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
-- owner = auth.uid() is checked on the row itself: when a project is created and sent straight back to the app,
-- can_read_project() cannot see the new row yet, so on its own it would reject the save
create policy "read own or shared projects" on public.projects
  for select to authenticated using (owner = auth.uid() or public.can_read_project(id));

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

-- ---------------------------------------------------------------- review: comments and sign-off
-- Kept apart from the project document, so a comment or an approval never clashes with someone editing the page.
-- Pages and blocks are identified by the ids inside the project document. Everyone a project is shared with
-- (viewers too) can comment and sign off; all changes go through the functions below.

create table if not exists public.page_comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  page_id     text not null,
  block_id    text,
  block_label text,
  body        text not null check (char_length(body) between 1 and 4000),
  author      uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
create index if not exists page_comments_page_idx on public.page_comments (project_id, page_id, created_at);

-- every sign-off step is kept, so there is a record of who approved what and when
create table if not exists public.page_signoffs (
  id           bigserial primary key,
  project_id   uuid not null references public.projects (id) on delete cascade,
  page_id      text not null,
  status       text not null check (status in ('not_started', 'in_review', 'changes_requested', 'approved')),
  note         text check (note is null or char_length(note) <= 2000),
  content_hash text,
  by_user      uuid references auth.users (id) on delete set null,
  at           timestamptz not null default now()
);
create index if not exists page_signoffs_page_idx on public.page_signoffs (project_id, page_id, at desc);

alter table public.page_comments enable row level security;
alter table public.page_signoffs enable row level security;

drop policy if exists "see comments on my projects" on public.page_comments;
create policy "see comments on my projects" on public.page_comments
  for select to authenticated using (public.can_read_project(project_id));
drop policy if exists "see sign-off on my projects" on public.page_signoffs;
create policy "see sign-off on my projects" on public.page_signoffs
  for select to authenticated using (public.can_read_project(project_id));

grant select on public.page_comments, public.page_signoffs to authenticated;
revoke all on public.page_comments, public.page_signoffs from anon;

-- comments on one page (or every page when p_page is null), oldest first
create or replace function public.page_comment_list(p_project uuid, p_page text)
returns table (id uuid, page_id text, block_id text, block_label text, body text, author_id uuid, author_email text,
               created_at timestamptz, resolved_at timestamptz, resolved_by_email text)
language sql stable security definer set search_path = public, auth as $$
  select c.id, c.page_id, c.block_id, c.block_label, c.body, c.author, a.email::text, c.created_at, c.resolved_at, r.email::text
    from public.page_comments c
    left join auth.users a on a.id = c.author
    left join auth.users r on r.id = c.resolved_by
   where c.project_id = p_project and (p_page is null or c.page_id = p_page) and public.can_read_project(p_project)
   order by c.created_at;
$$;

create or replace function public.add_page_comment(p_project uuid, p_page text, p_block text, p_block_label text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.can_read_project(p_project) then raise exception 'You do not have access to this project'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a comment first'; end if;
  insert into public.page_comments (project_id, page_id, block_id, block_label, body, author)
    values (p_project, p_page, nullif(p_block, ''), left(p_block_label, 200), trim(p_body), auth.uid())
    returning id into new_id;
  return new_id;
end $$;

-- the author, an editor or the owner can resolve a comment, or reopen it
create or replace function public.set_comment_resolved(p_comment uuid, p_resolved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.page_comments;
begin
  select * into c from public.page_comments where id = p_comment;
  if c.id is null or not public.can_read_project(c.project_id) then raise exception 'Comment not found'; end if;
  if c.author is distinct from auth.uid() and not public.can_edit_project(c.project_id) then
    raise exception 'Only the author or an editor can resolve this comment';
  end if;
  update public.page_comments
     set resolved_at = case when p_resolved then now() end,
         resolved_by = case when p_resolved then auth.uid() end
   where id = p_comment;
end $$;

-- the author or the project owner can delete a comment
create or replace function public.delete_page_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.page_comments;
begin
  select * into c from public.page_comments where id = p_comment;
  if c.id is null or not public.can_read_project(c.project_id) then raise exception 'Comment not found'; end if;
  if c.author is distinct from auth.uid() and not public.is_project_owner(c.project_id) then
    raise exception 'Only the author or the project owner can delete this comment';
  end if;
  delete from public.page_comments where id = p_comment;
end $$;

create or replace function public.set_page_signoff(p_project uuid, p_page text, p_status text, p_note text, p_hash text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_read_project(p_project) then raise exception 'You do not have access to this project'; end if;
  insert into public.page_signoffs (project_id, page_id, status, note, content_hash, by_user)
    values (p_project, p_page, p_status, nullif(trim(coalesce(p_note, '')), ''), p_hash, auth.uid());
end $$;

create or replace function public.page_signoff_history(p_project uuid, p_page text)
returns table (id bigint, status text, note text, content_hash text, by_email text, at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.status, s.note, s.content_hash, u.email::text, s.at
    from public.page_signoffs s left join auth.users u on u.id = s.by_user
   where s.project_id = p_project and s.page_id = p_page and public.can_read_project(p_project)
   order by s.at desc, s.id desc;
$$;

-- one row per page that has a sign-off step or a comment: the latest step and the comment counts
create or replace function public.page_review_summary(p_project uuid)
returns table (page_id text, status text, by_email text, at timestamptz, content_hash text, open_comments integer, comments integer)
language sql stable security definer set search_path = public, auth as $$
  with latest as (
    select distinct on (s.page_id) s.page_id, s.status, s.by_user, s.at, s.content_hash
      from public.page_signoffs s where s.project_id = p_project
     order by s.page_id, s.at desc, s.id desc
  ), counts as (
    select c.page_id, count(*) filter (where c.resolved_at is null)::integer as open_comments, count(*)::integer as comments
      from public.page_comments c where c.project_id = p_project group by c.page_id
  )
  select coalesce(l.page_id, n.page_id), l.status, u.email::text, l.at, l.content_hash, coalesce(n.open_comments, 0), coalesce(n.comments, 0)
    from latest l full join counts n on n.page_id = l.page_id
    left join auth.users u on u.id = l.by_user
   where public.can_read_project(p_project);
$$;

revoke execute on function public.page_comment_list(uuid, text), public.add_page_comment(uuid, text, text, text, text),
  public.set_comment_resolved(uuid, boolean), public.delete_page_comment(uuid), public.set_page_signoff(uuid, text, text, text, text),
  public.page_signoff_history(uuid, text), public.page_review_summary(uuid) from public, anon;
grant execute on function public.page_comment_list(uuid, text), public.add_page_comment(uuid, text, text, text, text),
  public.set_comment_resolved(uuid, boolean), public.delete_page_comment(uuid), public.set_page_signoff(uuid, text, text, text, text),
  public.page_signoff_history(uuid, text), public.page_review_summary(uuid) to authenticated;

-- ---------------------------------------------------------------- review links: a fixed copy anyone with the link can view
-- A link holds a copy of the project (or one section or page) taken when it was made or last updated, so later
-- edits do not show until someone updates it. The token in the link is 64 random hex characters. Images are copied
-- to the public "cms-shares" bucket under the token, so only someone with the link can find them.

create table if not exists public.share_links (
  token       text primary key,
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null default 'Review copy',
  scope       text not null default 'project',
  data        jsonb not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists share_links_project_idx on public.share_links (project_id);
alter table public.share_links enable row level security;
revoke all on public.share_links from anon, authenticated;

create or replace function public.create_share_link(p_project uuid, p_name text, p_scope text, p_data jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.can_edit_project(p_project) then raise exception 'Only the owner or an editor can make review links'; end if;
  insert into public.share_links (token, project_id, name, scope, data, created_by)
    values (t, p_project, coalesce(nullif(trim(p_name), ''), 'Review copy'), coalesce(p_scope, 'project'), p_data, auth.uid());
  return t;
end $$;

create or replace function public.update_share_link(p_token text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from public.share_links where token = p_token;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Review link not found'; end if;
  update public.share_links set data = p_data, updated_at = now() where token = p_token;
end $$;

create or replace function public.delete_share_link(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from public.share_links where token = p_token;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Review link not found'; end if;
  delete from public.share_links where token = p_token;
end $$;

-- the links of a project, for its owner and editors (without the copies themselves)
create or replace function public.share_link_list(p_project uuid)
returns table (token text, name text, scope text, created_at timestamptz, updated_at timestamptz, created_by_email text, page_count integer)
language sql stable security definer set search_path = public, auth as $$
  select s.token, s.name, s.scope, s.created_at, s.updated_at, u.email::text, coalesce(jsonb_array_length(s.data -> 'pages'), 0)
    from public.share_links s left join auth.users u on u.id = s.created_by
   where s.project_id = p_project and public.can_edit_project(p_project)
   order by s.created_at desc;
$$;

-- what the review page shows; callable without signing in, but only with the full token
create or replace function public.get_shared_project(p_token text)
returns table (name text, scope text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.name, s.scope, s.data, s.updated_at from public.share_links s where s.token = p_token and length(p_token) = 64;
$$;

revoke execute on function public.create_share_link(uuid, text, text, jsonb), public.update_share_link(text, jsonb),
  public.delete_share_link(text), public.share_link_list(uuid), public.get_shared_project(text) from public, anon;
grant execute on function public.create_share_link(uuid, text, text, jsonb), public.update_share_link(text, jsonb),
  public.delete_share_link(text), public.share_link_list(uuid) to authenticated;
grant execute on function public.get_shared_project(text) to anon, authenticated;

-- images for review links: "<token>/<image id>" in a public bucket; only the project's editors can add or remove them
create or replace function public.can_edit_share_media(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.share_links s
                  where s.token = split_part(object_name, '/', 1) and public.can_edit_project(s.project_id));
$$;

insert into storage.buckets (id, name, public, file_size_limit)
  values ('cms-shares', 'cms-shares', true, 10485760)
  on conflict (id) do nothing;

drop policy if exists "cms shares list" on storage.objects;
create policy "cms shares list" on storage.objects
  for select to authenticated using (bucket_id = 'cms-shares' and public.can_edit_share_media(name));
drop policy if exists "cms shares upload" on storage.objects;
create policy "cms shares upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'cms-shares' and public.can_edit_share_media(name));
drop policy if exists "cms shares replace" on storage.objects;
create policy "cms shares replace" on storage.objects
  for update to authenticated using (bucket_id = 'cms-shares' and public.can_edit_share_media(name))
  with check (bucket_id = 'cms-shares' and public.can_edit_share_media(name));
drop policy if exists "cms shares delete" on storage.objects;
create policy "cms shares delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cms-shares' and public.can_edit_share_media(name));

-- Done. Next: Authentication > Users > Add user, for yourself and each colleague (tick "Auto Confirm User").
