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
| **Edit** (a page) | The live preview (desktop / 1024 / 768 / 375, or the **HTML** view) with the inspector on the right: **Block** (the outline, or the selected block's fields), **Page** (heading, breadcrumb, banner, side column, versions) and **Section** (previous/next, page order, navigation settings). |
| **Site** | Global masthead and quicklinks, local masthead, main navigation, global and marketing banners, footer. |
| **Theme** | Every brand colour token, font stacks, base font size, custom CSS, presets. Updates the preview live. |
| **Components** | A styleguide of all blocks in their default state with the current theme. |
| **Media** | The image library: upload, drop files, see where each image is used, delete. |
| **Import** | Grabber (recommended), pasted HTML, saved file, or URL (server only). |
| **Save & export** | Project folder, project files, snapshots, per-page exports, whole-site ZIP. |
| **Cloud** | Only once cloud saving is set up ([DEPLOY.md](DEPLOY.md)): sign in, upload this project, open or share cloud projects, restore earlier cloud copies. |

## Editing in the preview

- **Click** a block to select it. A toolbar appears on it: move up / down, duplicate, delete, **+ Add below**.
- **Drag the ☰ handle** on that toolbar to move the block anywhere on the page.
- **Double-click any text** (headings, paragraphs, card titles, lead text, rich text) to edit it in place. Enter or clicking away saves, Esc cancels. Formatting toolbars are in the side panel's field for that block.
- **Ctrl+click** a link to follow it (a plain click only selects).
- The **Preview / HTML** toggle shows the design-system markup for the page, the selected block or the full document, with Copy (for Jadu) and Download.

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

**Chrome or Edge extension** (works with the CMS opened from a file, no server):

1. Go to `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. **Load unpacked** → choose the `chrome-extension` folder in the CMS folder. Pin the red **L** button.
3. Because the CMS is a file, open the extension's *Details* page and turn on **Allow access to file URLs** (once).
4. Keep the CMS tab open. On any leeds.ac.uk page click the red **L**: a pane offers *whole page*, *main content*, *pick a section* (hover and click a component) or *site section* (it lists the links in the section navigation, contents and previous/next, fetches the ticked pages from inside leeds.ac.uk and sends them as one section). **Send to CMS** delivers straight to the open CMS tab; **Copy** puts the HTML (or JSON for a section) on the clipboard for the Import screen.

**Bookmarklet** (if extensions are blocked): open `grabber/bookmarklet.html`, drag the button to the bookmarks bar, click it on a leeds.ac.uk page, use **Copy** in the pane, then paste on the Import screen.

## Exporting

From the editor's ⋯ menu (top right), a block's ⋯ menu, or *Save & export* in the left rail:

- **Standalone HTML** per page (styles, scripts and images inlined; links between pages work), and the **whole site as a ZIP**.
- **PNG** at 1280px, 375px or 2x, of a page or a single section.
- **PDF** made from a full-page rendering, like the FireShot extension: one tall page, or cut into A4 pages. Sections can be exported as PDF too.

Images from leeds.ac.uk appear in PNG and PDF exports when the CMS has them: the grabber sends the original images along with the page and they are saved to the media library on import, and in server mode the importer fetches them. Images typed in as hot-links to other sites can only be included when the browser is allowed to fetch them.
- **Markdown** and **Word (.doc)** for documents and reviews.
- **JSON** page or project exports.
- **Copy markup**: design-system HTML of a block or page for pasting into Jadu.

## Folder layout

```
leeds-cms/
  index.html              the CMS (double-click this)
  view.html               page viewer used by "Open page" (view.html#/slug)
  serve.ps1               optional local server with an import proxy
  README.md
  assets/ds/              design system assets (tokenised style.css, original, bundle.js, images)
  assets/cms/             CMS code: blocks.js (component registry), render.js, importer.js, exporter.js,
                          media.js, app.js, forms.js, store.js, seed.js
  assets/vendor/          html2canvas (PNG export)
  grabber/grabber.js      the page grabber; grabber/bookmarklet.html is the no-install version
  chrome-extension/       unpacked Chrome/Edge extension (manifest, background, grabber, icons)
```

### How the theme works

`assets/ds/css/style.css` is the design system's compiled stylesheet with every brand colour replaced by a CSS custom property with the original value as fallback, for example `var(--uol-color-brand,#c70000)`, and the Freight font stacks exposed as `--uol-font-sans` and `--uol-font-serif`. The Theme screen writes those variables into a `<style id="uol-theme">` block, so a change applies everywhere instantly. `style.original.css` is untouched for reference.

## Known limits

- Freight fonts load from Adobe Fonts over the internet; offline, the fallback fonts are used.
- PNG export includes images the browser is allowed to fetch; images uploaded to the library always work, images hot-linked from other sites may be blank.
- Cookie control, course finder search and other server-backed features are not simulated.
- Browser storage holds a few MB of content; very large projects (hundreds of imported pages) are better split, or kept in a linked folder.
