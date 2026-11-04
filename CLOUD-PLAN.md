# Cloud plan: shared, account-based Leeds prototyping CMS

Status: written 3 November 2026. **Phases 1 to 3 built on 4 November 2026** with two simplifications: accounts are email and password created by the admin in Supabase (Microsoft sign-in can follow once IT registers an app), and each project is stored as one JSON document merged page by page, rather than separate page and section tables. Setup steps are in `DEPLOY.md`.

## Goal

Host the CMS online so around ten colleagues can each sign in, keep their own pages, imports and images private, and share chosen projects with each other. Keep the current local-first behaviour (browser autosave, project folder, project files) so the tool still works offline and on locked-down laptops.

## Proposed stack

| Part | Choice | Why |
|---|---|---|
| Static hosting | Vercel (free tier) | The CMS is plain HTML/CSS/JS; Vercel serves it over HTTPS with no build step. GitHub Pages or Netlify would do equally well. |
| Accounts | Supabase Auth with Microsoft (Azure) sign-in | Colleagues use their Leeds accounts; no passwords to manage. Needs an app registration in the University's Microsoft tenant. |
| Data | Supabase Postgres with row-level security | Tables for projects, pages, sections and memberships. Policies make a person's rows invisible to everyone else unless shared. |
| Images | Supabase Storage with signed URLs | Replaces IndexedDB for cloud projects. Keep the same `media:` references so pages do not change. |
| Grabber | Unchanged | The extension and bookmarklet deliver to whichever CMS tab is open, local or hosted. The hosted CMS needs its origin added to the grabber's allowed targets. |

## Data model (first cut)

- `projects` (id, owner, name, site_settings JSON, created, updated)
- `pages` (id, project_id, slug, title, template, settings JSON, hero JSON, blocks JSON, status, updated_by, updated)
- `sections` (id, project_id, title, nav_style, page_order JSON)
- `project_members` (project_id, user_id, role: viewer | editor | owner)
- `media` (id, project_id, storage_path, name, width, height, size)
- Row-level security: a row is readable if the user is a member of its project; writable if the role is editor or owner.

## Sync approach

Local-first with cloud sync on top:

1. Keep the existing browser store as the working copy.
2. On every change (already debounced), push the changed page or settings to Supabase.
3. On open, pull the project and merge: last edit per page wins, using the `updated` timestamp; show a notice when a page was changed by someone else since it was last seen.
4. Images upload on add; the library lists cloud images and caches them locally.
5. Offline: changes queue and push when back online.

Real-time co-editing of the same page is out of scope; one editor per page at a time is enough for prototyping.

## Phases and effort

1. **Sign-in and private cloud sync** (about 1 to 2 days): auth, project table, push/pull of the project JSON and sections, sync status in the top bar.
2. **Sharing** (about 1 day): membership table, invite by email, viewer/editor roles, project switcher.
3. **Cloud media** (about 1 day): Storage bucket, signed URLs, migration of the local library.
4. **Polish**: activity log (who changed what), per-page locking hint, admin page.

## Costs and limits

- Vercel free tier: fine for ten users of a static site.
- Supabase free tier: 500 MB database, 1 GB storage, two projects. Enough for prototypes, but free projects are paused after a week without traffic; someone opens it weekly, or move to the Pro tier (about 25 USD a month).
- Images are the main storage use. The current resize-to-1600px rule keeps them small.

## Things to check first

- Tell IT: university work hosted on personal Vercel and Supabase accounts, even for public web content, is worth a short conversation. Ask whether an institutional account or an internal host is preferred.
- Microsoft sign-in needs an app registration (redirect URL to Supabase). IT may need to approve it.
- Data location: Supabase projects can be created in an EU region (for example Frankfurt or London); pick one.
- Export remains important: keep the project-file and ZIP exports so nothing is locked in.

## Alternative with no new accounts

A shared OneDrive or SharePoint folder with the existing "Link a project folder" feature already gives sharing, with the limitation that two people editing at the same time would overwrite each other. It costs nothing and needs no approvals, so it is a reasonable interim step.
