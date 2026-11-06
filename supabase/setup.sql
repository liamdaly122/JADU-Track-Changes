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
-- comments left through a review link carry the reviewer's name and the link instead of an account
alter table public.page_comments add column if not exists guest_name text check (guest_name is null or char_length(guest_name) between 1 and 80);
alter table public.page_comments add column if not exists guest_via text;
alter table public.page_comments add column if not exists share_token text;

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
-- approvals given through a review link carry the reviewer's name (and role, if given) instead of an account
alter table public.page_signoffs add column if not exists guest_name text check (guest_name is null or char_length(guest_name) between 1 and 80);
alter table public.page_signoffs add column if not exists guest_role text check (guest_role is null or char_length(guest_role) <= 120);
alter table public.page_signoffs add column if not exists guest_via text;
alter table public.page_signoffs add column if not exists share_token text;

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
drop function if exists public.page_comment_list(uuid, text);
create function public.page_comment_list(p_project uuid, p_page text)
returns table (id uuid, page_id text, block_id text, block_label text, body text, author_id uuid, author_email text,
               created_at timestamptz, resolved_at timestamptz, resolved_by_email text, guest_name text, guest_via text)
language sql stable security definer set search_path = public, auth as $$
  select c.id, c.page_id, c.block_id, c.block_label, c.body, c.author, a.email::text, c.created_at, c.resolved_at, r.email::text, c.guest_name, c.guest_via
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

drop function if exists public.page_signoff_history(uuid, text);
create function public.page_signoff_history(p_project uuid, p_page text)
returns table (id bigint, status text, note text, content_hash text, by_email text, at timestamptz, guest_name text, guest_role text, guest_via text)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.status, s.note, s.content_hash, u.email::text, s.at, s.guest_name, s.guest_role, s.guest_via
    from public.page_signoffs s left join auth.users u on u.id = s.by_user
   where s.project_id = p_project and s.page_id = p_page and public.can_read_project(p_project)
   order by s.at desc, s.id desc;
$$;

-- one row per page that has a sign-off step or a comment: the latest step and the comment counts
create or replace function public.page_review_summary(p_project uuid)
returns table (page_id text, status text, by_email text, at timestamptz, content_hash text, open_comments integer, comments integer)
language sql stable security definer set search_path = public, auth as $$
  with latest as (
    select distinct on (s.page_id) s.page_id, s.status, s.by_user, s.at, s.content_hash, s.guest_name
      from public.page_signoffs s where s.project_id = p_project
     order by s.page_id, s.at desc, s.id desc
  ), counts as (
    select c.page_id, count(*) filter (where c.resolved_at is null)::integer as open_comments, count(*)::integer as comments
      from public.page_comments c where c.project_id = p_project group by c.page_id
  )
  select coalesce(l.page_id, n.page_id), l.status, coalesce(u.email::text, l.guest_name || ' (reviewer)'), l.at, l.content_hash, coalesce(n.open_comments, 0), coalesce(n.comments, 0)
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

-- ---------------------------------------------------------------- Jadu checklist
-- Whoever makes the changes in Jadu ticks each item of a page's change list. item_hash fingerprints the change as it
-- was when ticked, so the CMS can tell when a ticked change was edited again. Viewers can tick too.

create table if not exists public.jadu_checks (
  project_id  uuid not null references public.projects (id) on delete cascade,
  page_id     text not null,
  item_key    text not null,
  item_hash   text not null,
  done_by     uuid references auth.users (id) on delete set null,
  done_at     timestamptz not null default now(),
  primary key (project_id, page_id, item_key)
);
alter table public.jadu_checks enable row level security;
drop policy if exists "see jadu checks on my projects" on public.jadu_checks;
create policy "see jadu checks on my projects" on public.jadu_checks
  for select to authenticated using (public.can_read_project(project_id));
grant select on public.jadu_checks to authenticated;
revoke all on public.jadu_checks from anon;

-- ticks for one page, or every page when p_page is null
create or replace function public.jadu_check_list(p_project uuid, p_page text)
returns table (page_id text, item_key text, item_hash text, done_by_email text, done_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select j.page_id, j.item_key, j.item_hash, u.email::text, j.done_at
    from public.jadu_checks j left join auth.users u on u.id = j.done_by
   where j.project_id = p_project and (p_page is null or j.page_id = p_page) and public.can_read_project(p_project);
$$;

create or replace function public.set_jadu_check(p_project uuid, p_page text, p_key text, p_hash text, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_read_project(p_project) then raise exception 'You do not have access to this project'; end if;
  if p_done then
    insert into public.jadu_checks (project_id, page_id, item_key, item_hash, done_by)
      values (p_project, p_page, left(p_key, 200), left(p_hash, 64), auth.uid())
      on conflict (project_id, page_id, item_key) do update set item_hash = excluded.item_hash, done_by = excluded.done_by, done_at = now();
  else
    delete from public.jadu_checks where project_id = p_project and page_id = p_page and item_key = p_key;
  end if;
end $$;

revoke execute on function public.jadu_check_list(uuid, text), public.set_jadu_check(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.jadu_check_list(uuid, text), public.set_jadu_check(uuid, text, text, text, boolean) to authenticated;

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
alter table public.share_links add column if not exists allow_comments boolean not null default true;
-- approvals through a link are off unless the link was made with them, or they are switched on later
alter table public.share_links add column if not exists allow_approvals boolean not null default false;
alter table public.share_links enable row level security;
revoke all on public.share_links from anon, authenticated;
-- deleting a link keeps the comments reviewers left through it
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'page_comments_share_token_fkey') then
    alter table public.page_comments add constraint page_comments_share_token_fkey
      foreign key (share_token) references public.share_links (token) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'page_signoffs_share_token_fkey') then
    alter table public.page_signoffs add constraint page_signoffs_share_token_fkey
      foreign key (share_token) references public.share_links (token) on delete set null;
  end if;
end $$;

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

create or replace function public.set_share_link_comments(p_token text, p_allow boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from public.share_links where token = p_token;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Review link not found'; end if;
  update public.share_links set allow_comments = p_allow where token = p_token;
end $$;

create or replace function public.set_share_link_approvals(p_token text, p_allow boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from public.share_links where token = p_token;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Review link not found'; end if;
  update public.share_links set allow_approvals = p_allow where token = p_token;
end $$;

-- the links of a project, for its owner and editors (without the copies themselves). page_hashes maps each page id in
-- the copy to its version fingerprint, so the editor can list a page's links and say when one shows an older version
drop function if exists public.share_link_list(uuid);
create function public.share_link_list(p_project uuid)
returns table (token text, name text, scope text, created_at timestamptz, updated_at timestamptz, created_by_email text, page_count integer,
               allow_comments boolean, guest_comments integer, allow_approvals boolean, guest_signoffs integer, page_hashes jsonb)
language sql stable security definer set search_path = public, auth as $$
  select s.token, s.name, s.scope, s.created_at, s.updated_at, u.email::text, coalesce(jsonb_array_length(s.data -> 'pages'), 0),
         s.allow_comments, (select count(*)::integer from public.page_comments c where c.share_token = s.token),
         s.allow_approvals, (select count(*)::integer from public.page_signoffs o where o.share_token = s.token),
         (select coalesce(jsonb_object_agg(e ->> 'id', coalesce(e ->> 'hash', '')), '{}'::jsonb)
            from jsonb_array_elements(coalesce(s.data -> 'pages', '[]'::jsonb)) e where e ->> 'id' is not null)
    from public.share_links s left join auth.users u on u.id = s.created_by
   where s.project_id = p_project and public.can_edit_project(p_project)
   order by s.created_at desc;
$$;

-- what the review page shows; callable without signing in, but only with the full token
drop function if exists public.get_shared_project(text);
create function public.get_shared_project(p_token text)
returns table (name text, scope text, data jsonb, updated_at timestamptz, allow_comments boolean, allow_approvals boolean)
language sql stable security definer set search_path = public as $$
  select s.name, s.scope, s.data, s.updated_at, s.allow_comments, s.allow_approvals from public.share_links s where s.token = p_token and length(p_token) = 64;
$$;

-- reviewers without an account comment through the link, with their name; they see only comments made through it
create or replace function public.add_guest_comment(p_token text, p_page text, p_block text, p_block_label text, p_name text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.share_links; new_id uuid;
begin
  select * into s from public.share_links where token = p_token and length(p_token) = 64;
  if s.token is null then raise exception 'This review link no longer works'; end if;
  if not s.allow_comments then raise exception 'Comments are turned off for this review link'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(s.data -> 'pages', '[]'::jsonb)) e where e ->> 'id' = p_page) then
    raise exception 'That page is not part of this review copy';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add your name so the team knows who the comment is from'; end if;
  if coalesce(trim(p_body), '') = '' or char_length(p_body) > 2000 then raise exception 'Write a comment of up to 2000 characters'; end if;
  if (select count(*) from public.page_comments where share_token = p_token and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many comments through this link in the last hour. Try again later.';
  end if;
  insert into public.page_comments (project_id, page_id, block_id, block_label, body, guest_name, guest_via, share_token)
    values (s.project_id, p_page, nullif(p_block, ''), left(p_block_label, 200), trim(p_body), left(trim(p_name), 80), s.name, p_token)
    returning id into new_id;
  return new_id;
end $$;

create or replace function public.guest_comment_list(p_token text)
returns table (id uuid, page_id text, block_id text, block_label text, guest_name text, body text, created_at timestamptz, resolved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.page_id, c.block_id, c.block_label, c.guest_name, c.body, c.created_at, c.resolved_at
    from public.page_comments c join public.share_links s on s.token = c.share_token
   where c.share_token = p_token and length(p_token) = 64 and s.allow_comments
   order by c.created_at;
$$;

-- stakeholders without an account approve or ask for changes through the link, when it allows that. The approval is of
-- the page as the link shows it: its fingerprint comes from the link's copy, so the CMS can tell when the page was
-- edited afterwards. Reviewers see only the sign-off steps made through the same link.
create or replace function public.add_guest_signoff(p_token text, p_page text, p_status text, p_name text, p_role text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.share_links; h text;
begin
  select * into s from public.share_links where token = p_token and length(p_token) = 64;
  if s.token is null then raise exception 'This review link no longer works'; end if;
  if not s.allow_approvals then raise exception 'Approvals are turned off for this review link'; end if;
  if p_status not in ('approved', 'changes_requested') then raise exception 'Choose approve or ask for changes'; end if;
  select e ->> 'hash' into h from jsonb_array_elements(coalesce(s.data -> 'pages', '[]'::jsonb)) e where e ->> 'id' = p_page limit 1;
  if not exists (select 1 from jsonb_array_elements(coalesce(s.data -> 'pages', '[]'::jsonb)) e where e ->> 'id' = p_page) then
    raise exception 'That page is not part of this review copy';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add your name so the team knows who signed off'; end if;
  if p_status = 'changes_requested' and coalesce(trim(p_note), '') = '' then raise exception 'Say what needs to change'; end if;
  if char_length(coalesce(p_note, '')) > 2000 then raise exception 'Keep the note to 2000 characters'; end if;
  if (select count(*) from public.page_signoffs where share_token = p_token and at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many sign-offs through this link in the last hour. Try again later.';
  end if;
  insert into public.page_signoffs (project_id, page_id, status, note, content_hash, by_user, guest_name, guest_role, guest_via, share_token)
    values (s.project_id, p_page, p_status, nullif(trim(coalesce(p_note, '')), ''), h, null,
            left(trim(p_name), 80), nullif(left(trim(coalesce(p_role, '')), 120), ''), s.name, p_token);
end $$;

create or replace function public.guest_signoff_list(p_token text)
returns table (page_id text, status text, guest_name text, guest_role text, note text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.page_id, o.status, o.guest_name, o.guest_role, o.note, o.at
    from public.page_signoffs o join public.share_links s on s.token = o.share_token
   where o.share_token = p_token and length(p_token) = 64 and s.allow_approvals
   order by o.at desc;
$$;

revoke execute on function public.create_share_link(uuid, text, text, jsonb), public.update_share_link(text, jsonb),
  public.delete_share_link(text), public.share_link_list(uuid), public.set_share_link_comments(text, boolean),
  public.set_share_link_approvals(text, boolean), public.get_shared_project(text),
  public.add_guest_comment(text, text, text, text, text, text), public.guest_comment_list(text),
  public.add_guest_signoff(text, text, text, text, text, text), public.guest_signoff_list(text) from public, anon;
grant execute on function public.create_share_link(uuid, text, text, jsonb), public.update_share_link(text, jsonb),
  public.delete_share_link(text), public.share_link_list(uuid), public.set_share_link_comments(text, boolean),
  public.set_share_link_approvals(text, boolean) to authenticated;
grant execute on function public.get_shared_project(text), public.add_guest_comment(text, text, text, text, text, text),
  public.guest_comment_list(text), public.add_guest_signoff(text, text, text, text, text, text), public.guest_signoff_list(text) to anon, authenticated;

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

-- ---------------------------------------------------------------- live updates
-- One small row per project changes whenever the project, its comments, sign-off or Jadu ticks change. Browsers that
-- have the project open listen to it through Supabase Realtime and fetch the news within seconds (the access rules
-- above still apply). The once-a-minute check in the CMS stays as a fallback.

create table if not exists public.project_pings (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  kind        text not null default 'project',
  page_id     text,
  at          timestamptz not null default now(),
  by_user     uuid
);
alter table public.project_pings enable row level security;
drop policy if exists "see pings of my projects" on public.project_pings;
create policy "see pings of my projects" on public.project_pings
  for select to authenticated using (public.can_read_project(project_id));
grant select on public.project_pings to authenticated;
revoke all on public.project_pings from anon;

create or replace function public.ping_project()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; pg text;
begin
  if tg_table_name = 'projects' then pid := new.id;
  elsif tg_op = 'DELETE' then pid := old.project_id; pg := old.page_id;
  else pid := new.project_id; pg := new.page_id;
  end if;
  -- nothing to announce while a project is being deleted
  if not exists (select 1 from public.projects where id = pid) then return null; end if;
  insert into public.project_pings (project_id, kind, page_id, at, by_user) values (pid, tg_argv[0], pg, now(), auth.uid())
    on conflict (project_id) do update set kind = excluded.kind, page_id = excluded.page_id, at = excluded.at, by_user = excluded.by_user;
  return null;
end $$;

drop trigger if exists ping_on_project on public.projects;
create trigger ping_on_project after update on public.projects for each row execute function public.ping_project('project');
drop trigger if exists ping_on_comment on public.page_comments;
create trigger ping_on_comment after insert or update or delete on public.page_comments for each row execute function public.ping_project('comments');
drop trigger if exists ping_on_signoff on public.page_signoffs;
create trigger ping_on_signoff after insert on public.page_signoffs for each row execute function public.ping_project('signoff');
drop trigger if exists ping_on_jadu on public.jadu_checks;
create trigger ping_on_jadu after insert or update or delete on public.jadu_checks for each row execute function public.ping_project('jadu');

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_pings') then
    alter publication supabase_realtime add table public.project_pings;
  end if;
end $$;

-- ---------------------------------------------------------------- email notifications (optional, off until set up)
-- Emails about sign-off and comments go out through Resend (resend.com) using the pg_net extension. They stay off
-- until the API key is in the Vault and notify_settings is switched on; DEPLOY.md, part 7, has the steps.
-- Each person chooses what they get per project on the Cloud screen: sign-off changes (on by default) and new
-- comments (off by default). Nobody is emailed about their own actions. A failed email never blocks the action.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
exception when others then null;
end $$;

create table if not exists public.notify_settings (
  id            integer primary key default 1 check (id = 1),
  enabled       boolean not null default false,
  from_address  text,
  site_url      text
);
insert into public.notify_settings (id) values (1) on conflict (id) do nothing;
alter table public.notify_settings enable row level security;
revoke all on public.notify_settings from anon, authenticated;

create table if not exists public.notify_prefs (
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  signoff     boolean not null default true,
  comments    boolean not null default false,
  primary key (user_id, project_id)
);
alter table public.notify_prefs enable row level security;
revoke all on public.notify_prefs from anon, authenticated;

create or replace function public.my_notify_prefs(p_project uuid)
returns table (available boolean, signoff boolean, comments boolean)
language plpgsql stable security definer set search_path = public as $$
declare on_ boolean; so boolean; cm boolean;
begin
  if not public.can_read_project(p_project) then return; end if;
  select coalesce(s.enabled, false) and s.from_address is not null into on_ from public.notify_settings s where s.id = 1;
  select np.signoff, np.comments into so, cm from public.notify_prefs np where np.user_id = auth.uid() and np.project_id = p_project;
  return query select coalesce(on_, false), coalesce(so, true), coalesce(cm, false);
end $$;

create or replace function public.set_notify_prefs(p_project uuid, p_signoff boolean, p_comments boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_read_project(p_project) then raise exception 'You do not have access to this project'; end if;
  insert into public.notify_prefs (user_id, project_id, signoff, comments) values (auth.uid(), p_project, p_signoff, p_comments)
    on conflict (user_id, project_id) do update set signoff = excluded.signoff, comments = excluded.comments;
end $$;

revoke execute on function public.my_notify_prefs(uuid), public.set_notify_prefs(uuid, boolean, boolean) from public, anon;
grant execute on function public.my_notify_prefs(uuid), public.set_notify_prefs(uuid, boolean, boolean) to authenticated;

-- sends one email; does nothing unless notifications are switched on and the key is in the Vault
create or replace function public.notify_send(p_to text, p_subject text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.notify_settings; k text;
begin
  select * into s from public.notify_settings where id = 1;
  if s.id is null or not s.enabled or s.from_address is null or p_to is null then return; end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into k using 'resend_api_key';
  exception when others then return;
  end;
  if k is null then return; end if;
  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', s.from_address, 'to', jsonb_build_array(p_to), 'subject', left(p_subject, 200), 'text', p_text));
  exception when others then raise warning 'Notification email not sent: %', sqlerrm;
  end;
end $$;

-- everyone on the project except the person who acted, who wants this kind of email
create or replace function public.notify_recipients(p_project uuid, p_actor uuid, p_kind text)
returns table (email text)
language sql stable security definer set search_path = public, auth as $$
  select u.email::text
    from (select p.owner as uid from public.projects p where p.id = p_project
          union select m.user_id from public.project_members m where m.project_id = p_project) people
    join auth.users u on u.id = people.uid
    left join public.notify_prefs np on np.user_id = people.uid and np.project_id = p_project
   where people.uid is distinct from p_actor
     and case when p_kind = 'signoff' then coalesce(np.signoff, true) else coalesce(np.comments, false) end;
$$;

create or replace function public.notify_page_title(p_project uuid, p_page text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select e ->> 'title' from public.projects p, jsonb_array_elements(coalesce(p.data -> 'pages', '[]'::jsonb)) e
                    where p.id = p_project and e ->> 'id' = p_page limit 1), 'a page');
$$;

create or replace function public.notify_footer(p_project uuid, p_page text)
returns text language sql stable security definer set search_path = public as $$
  select case when s.site_url is not null and s.site_url <> '' then E'\n\nOpen the page: ' || rtrim(s.site_url, '/') || '/#edit/' || p_page else '' end ||
         E'\n\nYou get these emails because you work on this project. Change what you get on the Cloud screen of the CMS.'
    from public.notify_settings s where s.id = 1;
$$;

create or replace function public.notify_on_signoff()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare proj text; title text; actor text; verb text; r record;
begin
  if not exists (select 1 from public.notify_settings where id = 1 and enabled) or new.status = 'not_started' then return null; end if;
  select name into proj from public.projects where id = new.project_id;
  title := public.notify_page_title(new.project_id, new.page_id);
  if new.guest_name is not null then
    actor := new.guest_name || coalesce(', ' || new.guest_role, '') || ' (reviewer, through the link "' || coalesce(new.guest_via, 'review link') || '")';
  else select email into actor from auth.users where id = new.by_user; end if;
  verb := case new.status when 'in_review' then 'sent for review' when 'approved' then 'approved' else 'sent back with changes requested' end;
  for r in select * from public.notify_recipients(new.project_id, new.by_user, 'signoff') loop
    perform public.notify_send(r.email, '[' || proj || '] "' || title || '" ' || verb,
      coalesce(actor, 'Someone') || ' ' || verb || ' "' || title || '" in ' || proj || '.' ||
      case when new.note is not null then E'\n\nNote: ' || new.note else '' end || public.notify_footer(new.project_id, new.page_id));
  end loop;
  return null;
exception when others then raise warning 'Notification not sent: %', sqlerrm; return null;
end $$;

create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare proj text; title text; actor text; r record;
begin
  if not exists (select 1 from public.notify_settings where id = 1 and enabled) then return null; end if;
  select name into proj from public.projects where id = new.project_id;
  title := public.notify_page_title(new.project_id, new.page_id);
  if new.guest_name is not null then actor := new.guest_name || ' (reviewer, through the link "' || coalesce(new.guest_via, 'review link') || '")';
  else select email into actor from auth.users where id = new.author; end if;
  for r in select * from public.notify_recipients(new.project_id, new.author, 'comments') loop
    perform public.notify_send(r.email, '[' || proj || '] New comment on "' || title || '"',
      coalesce(actor, 'Someone') || ' commented on "' || title || '"' || case when new.block_label is not null then ' (' || new.block_label || ')' else '' end || E':\n\n' ||
      new.body || public.notify_footer(new.project_id, new.page_id));
  end loop;
  return null;
exception when others then raise warning 'Notification not sent: %', sqlerrm; return null;
end $$;

revoke execute on function public.notify_send(text, text, text), public.notify_recipients(uuid, uuid, text),
  public.notify_page_title(uuid, text), public.notify_footer(uuid, text) from public, anon, authenticated;

drop trigger if exists notify_signoff on public.page_signoffs;
create trigger notify_signoff after insert on public.page_signoffs for each row execute function public.notify_on_signoff();
drop trigger if exists notify_comment on public.page_comments;
create trigger notify_comment after insert on public.page_comments for each row execute function public.notify_on_comment();

-- Done. Next: Authentication > Users > Add user, for yourself and each colleague (tick "Auto Confirm User").
