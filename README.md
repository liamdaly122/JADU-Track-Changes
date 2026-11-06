# Leeds prototyping CMS

A local, browser-based CMS that renders pages with the **real University of Leeds design system** (v1.0.22 stylesheet and scripts from designsystem.leeds.ac.uk), so you can prototype homepages, document pages, articles, multi-page sections and design changes that look and behave exactly like leeds.ac.uk.

It is **not a native app and there is nothing to install**: it is a folder of HTML, CSS and JavaScript that runs in Edge or Chrome. Your work lives in the browser and, once you link a project folder, on disk. Nothing is sent to any server unless you switch on the optional cloud saving.

**Online and shared (optional).** The same folder can be published as a website (GitHub and Vercel) with sign-in, projects saved online and sharing with colleagues (Supabase). Everything is done in the browser; follow [DEPLOY.md](DEPLOY.md).

## Loading the CMS

**Double-click `index.html`.** That is the whole process; it works on a managed laptop with no PowerShell, no admin rights and no installs. Edge or Chrome (current versions) is recommended; Firefox works for editing but cannot link a project folder.

The optional local server (`serve.ps1`, port 8765) only adds one thing, importing leeds.ac.uk pages by URL from inside the CMS. If PowerShell scripts are blocked on your machine you do not need it: the grabber extension does the same job from inside the browser.

## Keeping your work safe

Everything is autosaved to browser storage instantly, but a managed browser can be reset, so use one of these as well (both are on the **Save & export** screen):

1. **Link a project folder (recommended).** Pick a folder, for example inside OneDrive. The CMS writes `project.json` and a `media` folder with your images there after every change. Next time you open the CMS it asks you to reconnect with one click. If the folder's copy is newer than the browser's (for example on another computer) it offers to load it.
2. **Project files.** *Save project to file* writes one `.json` containing pages, site settings, sections and images; once saved, it is kept up to date automatically while the tab is open (Ctrl+Shift+S saves on demand). *Open project file* restores it anywhere.

On top of that: page **versions** (Ctrl+S, restore from the Versions group on the Page tab), whole-project **snapshots**, and **undo/redo** (Ctrl+Z / Ctrl+Y). Press **/** in the editor to add a block.

Images never go into browser storage as embedded data: they are stored once in the browser's database (IndexedDB, hundreds of MB) and in the linked folder, and pages only hold a small `media:` reference. If a project from an earlier version has embedded images, they are moved to the Media library automatically on start.

## The main screens

Screens are reached from the icon rail down the left edge (hover an icon for its name); each screen's actions sit in the white bar across the top.

| Screen | What it does |
|---|---|
| **Pages** | A table of pages per **section**. Create pages and sections, move pages between sections with the dropdown on each row; hover a row for Edit, Open and more. |
| **Edit** (a page) | The live preview (desktop / 1024 / 768 / 375), the **HTML** view, or **Changes** (what changed since the original, for Jadu), with the inspector on the right: **Block** (the outline, or the selected block's fields), **Page** (heading, breadcrumb, banner, side column, versions), **Section** (previous/next, page order, navigation settings) and **Review** (sign-off, page check, comments). |
| **Media** | The image library: upload, drop files, see where each image is used, delete. |
| **Import** | Grabber (recommended), pasted HTML, saved file, or URL (server only). |
| **Save & export** | Project folder, project files, snapshots, per-page exports, whole-site ZIP. |
| **Cloud** | Only once cloud saving is set up ([DEPLOY.md](DEPLOY.md)): sign in, upload this project, open or share cloud projects, restore earlier cloud copies. |
| **Settings** (gear icon, foot of the rail) | Links to the three screens used less often: |
| &nbsp;&nbsp;**Site** | Global masthead and quicklinks, local masthead, main navigation, global and marketing banners, footer. |
| &nbsp;&nbsp;**Theme** | Every brand colour token, font stacks, base font size, custom CSS, presets. Updates the preview live. |
| &nbsp;&nbsp;**Components** | A styleguide of all blocks with the current theme, and the **component library** for each kind of page (see below). |

## Editing in the preview

- **Click** a block to select it. A toolbar appears on its top edge with the block's name, move up / down, duplicate, delete and **Add below**.
- **Drag the dotted handle** at the left of that toolbar to move the block anywhere on the page.
- **Double-click any text** (headings, paragraphs, card titles, lead text, rich text) to edit it in place. Enter or clicking away saves, Esc cancels. Formatting toolbars are in the side panel's field for that block.
- **Ctrl+click** a link to follow it (a plain click only selects).
- The **Preview / HTML** toggle shows the design-system markup for the page, the selected block or the full document, with Copy (for Jadu) and Download.

### Component libraries

Each kind of page has its own library of components, so a prototype only uses what Jadu allows on that kind of page:

- **Homepage**: the widgets as well as everything else (53 components).
- **Document page**: what the Jadu rich text editor offers, since that is all a Jadu document page holds: rich text, headings, paragraphs, lists, blockquote, pull quote, text highlight, highlight block, in-text calls to action, in-text facts, accordion, table, image, button, arrow link, linked list, status message and raw HTML.
- **Article**: rich text and the components designed for news, events and profiles.

**Add a block** shows the page's library; **Show them** at the bottom (or a search) lists the rest, greyed out. **Check page** on the Review tab flags any block that is not in the page's library, and changing a page's template says how many blocks fall outside the new library. To change a library for this project, open Settings, **Components**, choose the kind of page and tick or untick components; **Reset to the default** undoes your changes. Libraries are saved with the project, so everyone sharing it uses the same ones.

## Sections (multi-page documents and site areas)

A section is an ordered group of pages. For every page in it the CMS generates the **side menu**, the **contents list** under the heading (the design system's multi-page document pattern), or both, plus **previous/next** links and a shared breadcrumb. Set the style in *Section settings* (also where you reorder pages by dragging). A page can opt out with "Generate this page's navigation from the section" on the editor's *Section* tab, and keep its own hand-written navigation instead. The same tab steps between the pages of the section, reorders them and holds the navigation settings.

Importing a site section with the grabber creates the section automatically.

**Export a whole section** from the *Export section* menu on the Pages screen or on the editor's *Section* tab: one PDF containing every page (tall pages or A4), a ZIP of one PDF per page, or a ZIP of one PNG per page. Pages are rendered one after another, so allow a few seconds per page.

The Pages screen can filter by title, template and status, sort pages outside sections, and collapse or expand each section (remembered between visits). The Media screen has filters; hover an image for copy-reference, download and delete, tick images (or click them) to select several, and a bar at the bottom offers bulk copy-refs, duplicate, download and delete.

## Images

Every image field has **Library**, **Upload** and a placeholder picker, and accepts a file dropped onto it. The rich text editor toolbar has an **Image** button. Large uploads are resized to 1600px on the long side.

## Rich text editor

The toolbar mirrors what the Jadu editor offers: bold, italic, strikethrough, superscript and subscript; a format menu (paragraph, headings 2 to 6, lead and small paragraphs, preformatted); undo and redo; cut, copy and paste-as-plain-text; bullet and numbered lists with indent and outdent; blockquote; links (Ctrl+K, with a picker for pages in the project, title and new-tab option; double-click a link to edit it); anchors; images from the library; tables (insert with caption and header row, then add or delete rows and columns, toggle the header row, edit the caption); an **Insert** menu of design-system components (lead paragraph, in-text CTA, text highlight, highlight block, status messages, accordion, pull quote, blockquote with citation, in-text facts, linked list, button link, arrow link, featured image); special characters; clear formatting; find and replace; spellcheck on/off; HTML source; maximise; and a word count.

## Importing

- **Grabber (recommended):** see below. Whole page, main content, one picked component, or a whole site section (several pages).
- **Pasted HTML:** page source, a fragment, or whatever the grabber copied. JSON from the grabber's section mode is recognised too.
- **File:** an `.html` saved from the browser, a page JSON export, or a project JSON.
- **URL** (server mode only): one page, or several URLs imported as one section.
- **Import section** inside the editor inserts blocks after the selected block instead of creating a page.

The importer recognises the design system markup and turns it into editable blocks, page settings and site settings. Anything it does not recognise is kept as a *Raw HTML* block.

### Page grabber

The grabber sends pages to the online CMS at https://jadutrackchange.vercel.app/.

**Chrome or Edge extension:**

1. Go to `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. **Load unpacked** → choose the `chrome-extension` folder in the CMS folder. Pin the red **L** button.
3. Only if you also use a copy of the CMS opened from a file: open the extension's *Details* page and turn on **Allow access to file URLs** (once).
4. Keep the CMS tab open (if several CMS tabs are open, the online one is used; if none is, **Send to CMS** opens the online CMS). On any leeds.ac.uk page click the red **L**: a pane offers *whole page*, *main content*, *pick a section* (hover and click a component) or *site section* (it lists the links in the section navigation, contents and previous/next, fetches the ticked pages from inside leeds.ac.uk and sends them as one section). **Send to CMS** delivers straight to the CMS tab; **Copy** puts the HTML (or JSON for a section) on the clipboard for the Import screen.

**Bookmarklet** (if extensions are blocked): open `grabber/bookmarklet.html` (or the Import screen on the online CMS) and drag the button to the bookmarks bar. Click it on a leeds.ac.uk page and use **Send to CMS**: it opens the online CMS and delivers the page to its Import screen. **Copy** and paste on the Import screen also works.

## Exporting

From the editor's ⋯ menu (top right), a block's ⋯ menu, or *Save & export* in the left rail:

- **Standalone HTML** per page (styles, scripts and images inlined; links between pages work), and the **whole site as a ZIP**.
- **PNG** at 1280px, 375px or 2x, of a page or a single section.
- **PDF** made from a full-page rendering, like the FireShot extension: one tall page, or cut into A4 pages. Sections can be exported as PDF too.

Images from leeds.ac.uk appear in PNG and PDF exports when the CMS has them: the grabber sends the original images along with the page and they are saved to the media library on import, and in server mode the importer fetches them. Images typed in as hot-links to other sites can only be included when the browser is allowed to fetch them.
- **Markdown** and **Word (.doc)** for documents and reviews.
- **JSON** page or project exports.
- **Copy markup**: design-system HTML of a block or page for pasting into Jadu.
- **Change lists for Jadu** (Word or PDF): see below.

## Review and sign-off

**Changes for Jadu.** Every page imported from leeds.ac.uk keeps an untouched copy of the original and its address. **Changes** in the editor's top bar compares the page with that copy and lists what to do in Jadu, in page order: blocks to add (with where they go), remove, edit or move, with text differences marked word by word, changed links and changed images. Blocks are matched by id, or by type and wording when the original was fetched again. **Word** and **PDF** turn the list into a document for whoever edits the page in Jadu (PDF opens the print window; choose *Save as PDF*). *Save & export* has change lists for every page, or all changed pages in one document. For pages imported before this feature, or made in the CMS, the Changes view can fetch the live page as the original (online), or use the page as it is now.

**Check page** (Review tab). Flags images without alt text, empty alt text, a missing or extra H1, skipped heading levels, empty headings, links without text or with vague text ("click here"), links with no address or a placeholder address, embeds without a title and tables without a header row. Each problem shows its block; click it to find the block in the preview. Links to paths that are not pages in this project, and links to other websites, are listed with **Open** buttons for checking by hand. It also flags blocks that are not in the page's component library (see Component libraries).

**Sign-off and comments** (Review tab, needs the cloud). Send a page for review; anyone the project is shared with, viewers included, can approve it or request changes, with a note. The same step makes a review link for reviewers without an account, or updates the page's existing links so they show the version sent. Every step is kept with who and when (**History**), and the tab says when a page was edited after it was approved. Comments go on the page or on a block: pick a block in the composer, choose *Comment on this block* in a block's ⋯ menu, or click a block in the preview while the Review tab is open. Blocks with open comments show a count in the outline; the Pages table shows each page's sign-off status and open comments. Comments and sign-off are stored apart from the project, so they never clash with someone editing the page.

**Jadu checklist** (Changes view, needs the cloud). Whoever makes the changes in Jadu ticks each item off as they go: the tick records who and when, the bar shows "3 of 7 done in Jadu", **Hide done** leaves only what is left, and the Pages table shows each page's progress. If a ticked change is edited again in the CMS, its tick is marked *Edited since ticked* and stops counting. Word and PDF change lists have tick boxes, filled in for what is done.

**Live updates** (needs the cloud). Comments, sign-off, Jadu ticks and colleagues' saves arrive within seconds through Supabase Realtime; the Cloud screen says "live updates on". If the connection drops, the CMS reconnects, and the once-a-minute check carries on regardless.

**Email notifications** (optional, see DEPLOY.md part 7). Emails when a page is sent for review, approved or sent back, and when someone comments, sent by Supabase through Resend. Each person chooses on the Cloud screen, per project.

**Review links** (Send for review, Review tab, editor ⋯ menu or Cloud screen; owners and editors). A read-only copy of a page, its section or the whole project that anyone with the link can open without an account (`review.html#<code>/<page>`). Each page's Review tab lists the links that include it, and says when a link shows an older version of the page; the Cloud screen lists them all. The copy does not change when the project does; **Update** replaces it with the latest version and keeps the link, **Delete** (in the link's ⋯ menu) stops the link working. Images are copied to a public storage folder named after the link's 64-character code, so only people with the link can find them.

Reviewers can **comment through the link** unless it was made with comments off (or they are turned off later on the Cloud screen). They give their name, then comment on the page or click **Pick a part** and click the part of the page the comment is about. Their comments appear on the Review tab, marked with the reviewer's name and the link they came through, and resolving or deleting works as for any comment. Reviewers see only comments made through the same link, never the team's own. A link takes at most 60 comments an hour, to stop abuse. The reviewer's name (and role) is the only thing the review page keeps in their browser.

Reviewers can also **approve or ask for changes through the link**, for stakeholders without an account. This is off unless you tick *Let reviewers approve or ask for changes* when making the link, or switch it on later in the link's ⋯ menu on the Cloud screen. The reviewer gives their name and, optionally, their role; asking for changes needs a note. The step is recorded in the page's sign-off history like the team's own, shown as, for example, "Approved · Prof A Smith, Dean of Faculty (reviewer)", and emails go out as for any sign-off. The approval is of the page exactly as the link showed it: if the link's copy was older than the page, or the page is edited afterwards, the Review tab says *Edited since it was approved*. Each link takes at most 20 sign-offs an hour, and reviewers see only the sign-offs made through the same link.

## Folder layout

```
leeds-cms/
  index.html              the CMS (double-click this)
  view.html               page viewer used by "Open page" (view.html#/slug)
  review.html             read-only page viewer for review links (review.html#<code>/<slug>)
  serve.ps1               optional local server with an import proxy
  README.md
  assets/ds/              design system assets (tokenised style.css, original, bundle.js, images)
  assets/cms/             CMS code: blocks.js (component registry), render.js, importer.js, exporter.js,
                          media.js, app.js, forms.js, store.js, seed.js, review.js (change lists and page checks),
                          cloud.js and cloud-config.js (cloud saving, sign-off, comments, review links)
  assets/vendor/          html2canvas (PNG export)
  grabber/grabber.js      the page grabber; grabber/bookmarklet.html is the no-install version
  chrome-extension/       unpacked Chrome/Edge extension (manifest, background, grabber, icons)
  tests/review-layout.js  layout check for review links (see below)
```

### Layout check for review links

`tests/review-layout.js` checks that review links lay out every block exactly as the published page does. It builds a document page and a homepage with every block (default content, plus a single fact and blocks without titles), draws each one as published, as a review link and in the editor preview, at 1024, 1280, 1440 and 1920 pixels wide, and compares each block's left edge, width, height and the gap above it. Run it after changing `render.js`, `blocks.js`, `review.html` or the design system CSS. It needs Node.js and Playwright (`npm install playwright`):

```
node tests/review-layout.js
node tests/review-layout.js --shots
```

The second form also saves screenshots of any page with differences in `tests/output`. The check fails if a review link differs from the published page. Differences in the editor preview are listed as warnings: the editor wraps each block in a box for its toolbar and outline, so some spacing differs there, and a few small homepage blocks (Key facts, Year of entry, Pagination, the course search banner) sit differently.

### How the theme works

`assets/ds/css/style.css` is the design system's compiled stylesheet with every brand colour replaced by a CSS custom property with the original value as fallback, for example `var(--uol-color-brand,#c70000)`, and the Freight font stacks exposed as `--uol-font-sans` and `--uol-font-serif`. The Theme screen writes those variables into a `<style id="uol-theme">` block, so a change applies everywhere instantly. `style.original.css` is untouched for reference.

## Known limits

- Freight fonts load from Adobe Fonts over the internet; offline, the fallback fonts are used.
- PNG export includes images the browser is allowed to fetch; images uploaded to the library always work, images hot-linked from other sites may be blank.
- Cookie control, course finder search and other server-backed features are not simulated.
- The working copy (pages, site settings, page versions and the originals kept for Changes) must fit in about 5 MB of browser storage. Save & export shows what takes the room; the CMS warns at 70% and 90% and **Free up space** removes older page versions or the originals of finished pages. Images and snapshots are kept in the browser's database, which has far more room.
