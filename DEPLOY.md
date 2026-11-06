# Putting the CMS online: GitHub, Vercel and Supabase

This guide takes the Leeds prototyping CMS from a folder on your laptop to a website your colleagues can sign in to, with projects saved online and shared. Everything happens in a web browser. Nothing is installed and no command line is needed.

| Part | What it gives you | Time |
|---|---|---|
| 1. GitHub | A private online copy of the code, and the place Vercel reads it from | 10 minutes |
| 2. Vercel | The CMS at a web address, for example `https://leeds-prototyping-cms.vercel.app` | 5 minutes |
| 3. Supabase | Sign-in, projects saved online, sharing, images and hourly backups | 20 minutes |
| 4. First use | Accounts, your projects, sharing | 10 minutes |

Parts 1 and 2 on their own give you the CMS online, with each person's work kept in their own browser. Part 3 adds accounts and the shared cloud: from then on the CMS shows a sign-in screen until someone signs in.

## Before you start

- **Tell IT.** University work on personal Vercel and Supabase accounts is worth a short conversation, even for public web content. Ask whether they prefer an institutional account. The guide works the same either way.
- **Free plans and their limits.** Vercel's free Hobby plan is meant for personal, non-commercial use, so for ongoing team use the Pro plan (about 20 USD a month per member) is the safe choice. Supabase's free plan pauses a project after a week with no activity. The site prevents that itself: a scheduled job on Vercel (`api/keepalive.js`) makes one small database request every morning. If a project does pause, reopening it from the Supabase dashboard brings it back. Supabase's Pro plan is about 25 USD a month.
- **Use Edge or Chrome.** Folder drag and drop in step 1 needs one of them.
- You already have a GitHub account (`liamdaly122`). Vercel and Supabase both let you sign in with it, so there are no new passwords to manage for those.

---

## Part 1: GitHub

### Create a private repository

1. Go to [github.com](https://github.com) and sign in.
2. Click **+** at the top right, then **New repository**.
3. Fill in:
   - **Repository name**: `leeds-prototyping-cms`
   - **Private**: selected
   - Leave **Add a README**, **.gitignore** and **license** unticked. The folder already has its own.
4. Click **Create repository**.

### Upload the files

1. On the new, empty repository page, click the link **uploading an existing file**.
2. In File Explorer, open the `leeds-cms` folder (in OneDrive, under `Claude\Apps\leeds-cms`).
3. Press **Ctrl+A** to select everything inside the folder. Select the contents, not the `leeds-cms` folder itself.
4. Drag the selection onto the GitHub page. Subfolders such as `assets` and `supabase` keep their structure.
5. Wait until every file is listed. There are about 50, well under GitHub's limit of 100 per upload.
6. Under **Commit changes**, type `First upload` and click **Commit changes**.

### Check it worked

The repository page should list the folders `api`, `assets`, `chrome-extension`, `grabber`, `mockups` and `supabase`, and files including `index.html`, `vercel.json` and this `DEPLOY.md`.

If folders arrived flattened, with every file at the top level, delete the repository and try again in Edge or Chrome. You can delete it under **Settings**, at the bottom of the page.

### Updating the code later

Upload changed files the same way: **Add file**, then **Upload files**, and drag them in. To keep a file in its folder, drag the folder it sits in, for example `assets`. GitHub replaces files with the same path.

For a one-line change, open the file on GitHub, click the pencil icon, edit, then click **Commit changes**.

---

## Part 2: Vercel

1. Go to [vercel.com](https://vercel.com) and click **Sign Up**. Choose **Hobby** (or Pro, see above) and **Continue with GitHub**.
2. Click **Add New…**, then **Project**.
3. Under **Import Git Repository**, click **Install** (or **Adjust GitHub App Permissions**). In the GitHub window, choose **Only select repositories**, pick `leeds-prototyping-cms` and click **Install**.
4. Back in Vercel, click **Import** next to the repository.
5. On **Configure Project**:
   - **Framework Preset**: Other
   - **Root Directory**: leave as `./`
   - **Build and Output Settings**: leave everything empty. The CMS has no build step.
6. Click **Deploy**. After about 30 seconds Vercel shows the address, for example `https://leeds-prototyping-cms.vercel.app`.
7. Open the address. The CMS loads with the sample site.

What changes compared with double-clicking `index.html`:

- **Import by URL works.** On the Import screen, **Fetch one page** now works online. For safety it only fetches addresses on leeds.ac.uk.
- **Updates go live by themselves.** Every commit to GitHub goes live within a minute or two.
- **Storage is separate.** The online site and the double-clicked copy each keep their own browser storage. Part 4 shows how to move work across.

---

## Part 3: Supabase (sign-in and shared projects)

### Create the project

1. Go to [supabase.com](https://supabase.com), click **Start your project** and **Continue with GitHub**.
2. Click **New project** and fill in:
   - **Name**: `leeds-cms`
   - **Database Password**: click **Generate a password** and keep it in a password manager. You will not need it day to day.
   - **Region**: West EU (London)
3. Click **Create new project** and wait about two minutes.

### Set up the database

1. In the left menu, click **SQL Editor**, then **New query** (or the **+** tab).
2. Open `supabase/setup.sql`. Either open it from the `leeds-cms` folder in Notepad, or open it on GitHub and click the copy icon above the file.
3. Copy the whole file, paste it into the SQL editor, and click **Run**.
4. You should see **Success. No rows returned**. If you see an error, copy the message and send it to Claude.

Running the file again later is safe.

### Accounts: who can sign up, and the emails

Colleagues create their own accounts on the CMS sign-in screen. `setup.sql` only lets **@leeds.ac.uk** addresses (and their subdomains) do that. Supabase needs three settings for it.

**1. Allow sign-ups**

1. Go to **Authentication**, then **Sign In / Providers** (on older layouts, **Providers** under **Configuration**).
2. Check that **Email** is enabled.
3. Turn **on** **Allow new users to sign up**.
4. Leave **Confirm email** on. New accounts then confirm their address from an email before they can sign in, so nobody can make an account with someone else's address.
5. Click **Save**.

**2. Tell Supabase where the CMS is**

1. Go to **Authentication**, then **URL Configuration**.
2. Set **Site URL** to your Vercel address, for example `https://jadutrackchange.vercel.app`.
3. Under **Redirect URLs**, click **Add URL** and add the same address followed by `/**`, for example `https://jadutrackchange.vercel.app/**`. The links in confirmation and password emails come back here.

**3. Send the emails through Resend**

Supabase's own email service only sends to the people in your Supabase team, a few an hour, so colleagues would never get their confirmation emails. Use Resend instead (the same account as part 7, if you set that up):

1. In Resend, add and verify a sending domain (**Domains**). Resend's test address only delivers to your own inbox, so a verified domain is needed for colleagues. If you cannot verify a domain, see the note below.
2. Create an API key (**API Keys**, **Create API Key**, permission **Sending access**).
3. In Supabase, go to **Authentication**, then **Emails**, then **SMTP Settings**, and turn on **Enable custom SMTP**:
   - **Sender email**: an address on your verified domain, for example `cms@your-domain`
   - **Sender name**: `Leeds prototyping CMS`
   - **Host**: `smtp.resend.com`, **Port**: `465`
   - **Username**: `resend`, **Password**: the Resend API key
4. Click **Save**. Under **Rate Limits**, raise **emails sent per hour** to 30 or so.

> **No domain to verify?** You can turn **Confirm email** off instead (step 1). Accounts then work straight away, with no email at all. The catch: anyone who knows a colleague's Leeds address could make an account with it. For a small pilot with people you know, that may be acceptable; for anything wider, set up the emails.

**Other addresses.** To let other domains sign up, run this in the SQL Editor (it replaces the list):

```sql
update public.app_settings set allowed_email_domains = array['leeds.ac.uk', 'example.org'];
```

An empty list (`array[]::text[]`) lets anyone sign up.

**Adding an account yourself.** Under **Authentication**, **Users**, **Add user**, **Create new user**, with **Auto Confirm User** ticked, still works (for an allowed address). The person signs in with the password you set and changes it from the account button in the CMS.

### Connect the CMS to Supabase

1. In Supabase, open **Project Settings** (the gear icon), then **API Keys**. Copy the **Publishable key**, which starts `sb_publishable_`. If you only see a **Legacy API keys** tab, copy the **anon public** key instead, which starts `eyJ`.
2. Still in **Project Settings**, open **Data API** (or **API**) and copy the **Project URL**, which looks like `https://abcdefghijklmnop.supabase.co`.
3. On GitHub, open `assets/cms/cloud-config.js`, click the pencil icon, and fill in the two values between the quotes:
   ```js
   window.UOL_CLOUD_CONFIG = {
     url: 'https://abcdefghijklmnop.supabase.co',
     anonKey: 'sb_publishable_...'
   };
   ```
4. Click **Commit changes**. Vercel redeploys in about a minute.
5. Make the same edit to `assets/cms/cloud-config.js` in your OneDrive folder, using Notepad. The double-clicked copy can then sign in too, which Part 4 uses.

Both values are safe to have in the code. The database rules from `setup.sql` decide what each signed-in person can see.

> **Never** paste the **secret** key or the **service_role** key into the CMS. Either one bypasses every rule in the database. The CMS refuses to use them and shows a warning. If one is ever exposed, create a new secret key in Supabase so the old one stops working.

---

## Part 4: First use

### Already using the cloud? Updating to accounts

If you set the cloud up before accounts arrived, do this once after merging the update:

1. In Supabase, run the whole of `supabase/setup.sql` again (SQL Editor). It moves every page of every project into its own row and keeps everything else. Nothing is deleted.
2. Make the three settings in Part 3, **Accounts: who can sign up, and the emails**.
3. Ask everyone to reload any CMS tab they have open. A tab opened before the update cannot save any more (it shows **Cloud: problem**) until it is reloaded, so it can never save over the new layout.
4. Existing accounts keep working. On first sign-in, each person is asked nothing new: their projects are on the **Projects** screen.

Work a browser kept before accounts is not lost. If that browser was connected to a cloud project, it is brought into that project the first time it is opened. If not, the **Projects** screen shows **Work from before accounts** with **Make it a project**.

### Sign in

1. Open your Vercel address. Until you sign in, the CMS shows only the sign-in screen.
2. Click **Create an account**, with your Leeds address. Confirm it from the email, if Confirm email is on.
3. A short tour runs the first time. Watch it again any time from **Help** or the account button (your initials at the foot of the left-hand bar).

### Projects

The **Projects** screen (the folder icon at the top of the left-hand bar) lists your projects and the ones shared with you. **New project** starts one, empty or with example pages; **From a project file** turns a saved project file into a project. Click a project to open it; the CMS remembers it, so next time you are taken straight there.

Each browser keeps a copy of the projects it opens, so they open straight away and you can keep working if the connection drops. The top bar shows the state:

| Chip | Meaning |
|---|---|
| Cloud | Everything is saved |
| Cloud: waiting / saving | A save is about to happen or happening |
| Cloud: offline | No connection; changes are kept and saved later |
| Cloud: view only | You can view this project but not change it |
| Cloud: problem | Hover the chip, or open **Sharing**, for the reason |

### Share with colleagues

1. Open the project, then **Sharing** (the share icon in the left-hand bar).
2. Under **People**, enter their email address and choose **Can edit** or **Can view**.
3. If they have an account, the project appears on their Projects screen straight away. If not, they are **invited**: they join as soon as they create an account with that address. With notifications set up (part 7), they also get an email with the link.

### How working together behaves

- **Saving.** Every change is saved in the browser straight away and to the cloud about two seconds later. Only the page that changed is sent.
- **Colleagues' changes.** These arrive within seconds (live updates), with a check every minute as a fallback.
- **The same page.** If two people edit the same page, changes to different blocks are merged, so both are kept. Only when both change the same block is the more recent edit kept, and the other person is told.
- **Who is where.** Colleagues' initials show in the top bar, next to the pages they have open on the Pages screen, and on the block they picked in the preview. The editor says when someone else has your page open.
- **Undoing.** The cloud keeps a copy of each page at most once an hour while it changes (the last 48): open the page, then the **Page** tab, **Versions**, **Hourly cloud copies**. Deleted pages can be brought back from **Recently deleted** on the Pages screen. Site settings and sections have their own hourly copies under **Sharing**.
- **Exports.** Exports, project files and the linked project folder all work as before.

---

## Part 5: The grabber with the online site

The extension and the bookmarklet send pages to `https://jadutrackchange.vercel.app/`.

- **Chrome or Edge extension.** Version 1.3.0 prefers the online CMS tab when more than one CMS tab is open, and opens the online CMS if none is. Go to `chrome://extensions` (or `edge://extensions`) and click the reload arrow on **Leeds CMS page grabber**. If you give the site its own domain later, change the address in `chrome-extension/background.js` (`CMS_HOME`), in `grabber/grabber.js` and `chrome-extension/grabber.js`, and in `host_permissions` in `chrome-extension/manifest.json`.
- **Bookmarklet.** Drag the button from `grabber/bookmarklet.html`, or the **Send to Leeds CMS (this site)** button on the online site's **Import** screen, to your bookmarks bar. Its **Send to CMS** opens the online site and delivers the page there. Delete any older copy of the bookmark first, because the old one still sends to `localhost`.
- **Copy and paste.** **Copy** in the grabber pane, then paste on the Import screen. This always works.

---

## Part 6: Sign-off, comments, review links, the Jadu checklist and live updates

These features keep their data in Supabase, so the database needs the extra tables and functions in the latest `supabase/setup.sql`. Run it again whenever the file changes on GitHub.

1. On GitHub, open `supabase/setup.sql` and copy the whole file.
2. In Supabase, go to **SQL Editor**, click **New query**, paste it in and click **Run**. It should say "Success. No rows returned".

Running the file again is safe: it only adds what is missing and keeps every project, image, comment and account. It also creates a second storage bucket, `cms-shares`, which holds the images in review links, and adds a table to Supabase Realtime for live updates. Realtime is on by default in Supabase, so there is nothing else to switch on; the Sharing screen says "live updates on" once it is working.

Then, in the editor:

- **Changes** in the top bar lists what changed since the original leeds.ac.uk page, with **Word** and **PDF** change lists for Jadu.
- The **Review** tab on the right checks the page, and holds sign-off, comments and the page's review links.
- **Send for review** on the Review tab marks the page as in review for the team and, in the same step, makes a read-only review link for reviewers without an account (or updates the page's existing one). Reviewers can comment with their name, and approve or ask for changes if you allow it. Every link is also listed on the **Cloud** screen.

---

## Part 7: Email notifications (optional)

The CMS can email people when a page is sent for review, approved or sent back, and when someone comments. It sends through **Resend** (resend.com), an email service with a free plan (3,000 emails a month, 100 a day). Supabase sends the emails itself, so nothing is added to the website and the key stays in Supabase.

**Before you start.** Resend only delivers to other people once you have verified a domain you control, by adding a few DNS records. For a `leeds.ac.uk` sender address that means asking IT. Until then, Resend delivers only to the address you signed up with, which is enough to try it out.

1. **Resend account.** Go to resend.com and sign up (you can use GitHub).
2. **Domain.** In Resend, open **Domains**, click **Add Domain** and follow the steps to add its DNS records. Skip this to test with your own address only.
3. **API key.** Open **API Keys**, click **Create API Key**, give it **Sending access** and copy the key (it starts `re_`).
4. **Store the key in Supabase.** In **SQL Editor**, run this with your key in place of the example. Vault keeps it encrypted.
   ```sql
   select vault.create_secret('re_your_key_here', 'resend_api_key');
   ```
5. **Switch notifications on.** Run this, with your sender address and the site address. For testing without a domain, use `onboarding@resend.dev` as the sender.
   ```sql
   update public.notify_settings
      set enabled = true,
          from_address = 'Leeds prototyping CMS <cms@your-domain.ac.uk>',
          site_url = 'https://jadutrackchange.vercel.app/'
    where id = 1;
   ```
6. **Check pg_net is on.** In Supabase, **Database**, **Extensions**: `pg_net` should be enabled. `setup.sql` turns it on when it can.
7. **Choose what to get.** Everyone now sees **Email notifications** on the Sharing screen, per project: sign-off changes (on by default) and new comments (off by default). Nobody is emailed about their own actions.

To switch emails off again: `update public.notify_settings set enabled = false where id = 1;`

If emails do not arrive, the **Logs** page in Resend shows what it received, and in Supabase `select * from net._http_response order by created desc limit 10;` shows Resend's replies. A failed email never stops a comment or sign-off from saving.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| "Email or password not recognised" | Check the user exists under Authentication, Users. If they made the account themselves, they need to confirm it from the email first. |
| "Confirm your email address first" | Open the link in the confirmation email, or click **Send the confirmation email again**. No email arriving means the custom SMTP settings in Part 3 are missing or wrong. |
| "Accounts are limited to leeds.ac.uk email addresses" | Use a Leeds address, or add the domain (Part 3, **Other addresses**). |
| "New accounts are switched off" | Turn on **Allow new users to sign up** (Part 3). |
| A confirmation or password link says it has expired | Links work once, for a limited time. Ask for a new one from the sign-in screen. Links opening the wrong site: check **Site URL** and **Redirect URLs** (Part 3). |
| Cloud: problem, "permission denied for table projects" | That tab was opened before the update. Reload it. |
| Cloud: problem, with "permission denied" or "relation does not exist" | `setup.sql` did not run completely. Run the whole file again. |
| A colleague sees grey placeholder images | The uploader's browser had not finished uploading. Ask them to wait for the **Cloud** chip, then click **Check now** on your Sharing screen. |
| The site opens straight into the editor with no sign-in screen | `assets/cms/cloud-config.js` on GitHub is still empty, or Vercel has not finished redeploying. Without it the CMS works on one project in that browser only. |
| "Wrong key in cloud-config.js" | A secret key was pasted. Replace it with the publishable key and create a new secret key in Supabase. |
| Everything stopped working after a quiet week | The free Supabase project paused. Open the Supabase dashboard and click **Restore project**. Then check the daily keep-alive job: in Vercel, open the project, **Settings**, **Cron Jobs**. It should list `/api/keepalive`; **View logs** shows each run, and a run that says `"ok":true` reached the database. |
| Import by URL fails online | Only leeds.ac.uk addresses are allowed. Use the grabber or paste the HTML for anything else. |
| "The cloud database needs an update for this feature" | Run the whole of `supabase/setup.sql` again (Part 6). |
| A review link says it does not work | The link was deleted, or only part of it was copied. Copy it again from the page's Review tab or the Sharing screen. |
| "The latest change could not be saved in this browser" | The disk is nearly full, or the browser is in private mode. Free some disk space; **Free up space** on Save & export removes older page versions and the originals of finished pages. |
| The Sharing screen never says "live updates on" | Nothing is lost: colleagues' changes still arrive within a minute. Check Realtime is enabled for the project in Supabase (Project Settings). |
| No notification emails | See the end of part 7. |

## What the new files do

| File | Purpose |
|---|---|
| `vercel.json` | Tells Vercel to serve the folder as it is, routes `/__proxy` to the import proxy, and schedules the daily keep-alive job. |
| `api/proxy.js` | Online version of the local server's proxy. It fetches leeds.ac.uk pages and images for **Import by URL** and image exports. |
| `api/keepalive.js` | Run by Vercel every morning (the `crons` entry in `vercel.json`). It makes one small read-only database request so the free Supabase project never pauses. It reads the project address from `cloud-config.js`, so there is nothing to set up. Optional: add an environment variable `CRON_SECRET` in Vercel (any long random text) and only Vercel's scheduler can call it. |
| `supabase/setup.sql` | Creates the tables, access rules, accounts and invitations, the pages table with hourly page copies, sharing functions, comments, sign-off, review links and the two image buckets. |
| `assets/cms/cloud-config.js` | The two values from Supabase. Empty means cloud saving is off. |
| `assets/cms/cloud.js` | Accounts (sign in, sign up, password emails), projects, saving page by page with block-level merging, presence, sharing, history, comments, sign-off and review links. Talks to Supabase directly, so there is no build step. |
| `assets/cms/tour.js` | The animated tour shown after sign-up. |
| `assets/cms/review.js` | Compares a page with its original for the Changes view and change lists, and runs the page checks. |
| `review.html` | The page reviewers see when they open a review link. It needs no account and stores nothing in their browser. |
| `.gitignore` | Keeps exported project files out of the repository if you later use Git or GitHub Desktop. |

Microsoft (Leeds account) sign-in instead of passwords is possible later. It needs an app registration from IT in the University's Microsoft tenant; `CLOUD-PLAN.md` has the details.
