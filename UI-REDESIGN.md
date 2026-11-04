# UI redesign proposal

The current interface grew feature by feature and now shows everything at once: a toolbar with eleven controls, a section bar, four sidebar tabs, a block list with per-row menus, long forms, and a preview bar with eight buttons. This note compares how the leading editors avoid that, then proposes a calmer layout. A mockup of the proposal is in `mockups/editor-redesign.html`.

## What the popular editors do

| Product | Pattern worth borrowing |
|---|---|
| **WordPress (Gutenberg / site editor)** | The canvas is the editor. Blocks are edited in place; the sidebar is an *inspector* that shows settings only for the selected block, with a Page tab when nothing is selected. A collapsible "List view" shows the outline. The inserter is a "+" button, both in the top bar and between blocks. The top bar is almost empty: undo, redo, save state, preview, publish. |
| **Webflow / Framer** | A slim icon rail on the left (pages, components, assets, settings), the canvas in the middle, an inspector on the right. Everything rarely used lives behind the rail icons rather than on screen. Device widths are three small icons in the top bar. |
| **Storyblok** | Visual editor: live preview in the centre, a structured form for the clicked component on the right, "add block" buttons drawn directly on the preview. Closest to what this CMS does today, but with one form at a time rather than a scrolling list of forms. |
| **Sanity / Contentful** | Content list as a dense table with filters and a status chip, not cards. Documents open in a focused pane; metadata (slug, status, dates) sits in a compact header. Collapsed field groups with "Advanced" closed by default. |
| **Squarespace / Wix** | Hide complexity until it is needed: toolbars appear on hover or selection, settings open in a floating panel, and "Done" closes it. Primary action is one colour; everything else is quiet. |
| **Notion** | Typing is primary; block menus appear on hover as a small handle. Keyboard first: "/" to insert, drag by the handle only. |

Common threads: one primary editing surface (the preview), one contextual inspector, a near-empty top bar, progressive disclosure, icons with tooltips rather than text buttons, and a single accent colour.

## What feels cluttered today

- Two competing editing surfaces (block list with inline forms on the left, editable preview on the right). Users have to decide which to use.
- The toolbar carries page meta (title, slug, template, status) and actions (undo, redo, version, export, open) in one row.
- The section switcher bar adds a third row of controls above the editor.
- Block rows each show a grip, two arrows and a "⋯" menu, so a 14-block page shows 56 controls before anything is opened.
- Forms are long: every field visible, hints under most fields, repeaters inside repeaters.
- The preview bar mixes mode toggle, four device widths and a Refresh button.
- Pages screen: card per page with five buttons each; filters and a long help paragraph above.
- Explanatory text everywhere ("A section is a group of pages…", "Tip: in the preview…").

## Proposed layout

```
┌──┬───────────────────────────────────────────────────┬───────────────┐
│  │  ‹ Pages   Fees and funding  ·  Draft ▾            │  Inspector    │
│R │  ⟲ ⟳    ▭ ▯ ▮ (device)   Preview | HTML   ●Saved  │  ┌─────────┐  │
│a ├───────────────────────────────────────────────────┤  │ Block   │  │
│i │                                                   │  │ Page    │  │
│l │                  live preview                     │  │ Section │  │
│  │        (click to select, double-click to edit,    │  └─────────┘  │
│  │         "+" between blocks, drag by handle)       │  fields for   │
│  │                                                   │  the selected │
│  │                                                   │  block only   │
└──┴───────────────────────────────────────────────────┴───────────────┘
```

1. **Icon rail (left, 56px).** Pages, Site, Theme, Media, Import, Export, Help. Replaces the text navigation bar. Tooltips on hover, labels on wide screens optional.
2. **Top bar (one row).** Back to pages, page title (click to edit), status chip, undo/redo, three device icons, Preview/HTML segmented control, save state dot, one primary button ("Open page") and a "⋯" menu holding versions, export formats, duplicate, delete, page JSON.
3. **Canvas.** The preview becomes the only editing surface. On hover a block shows a thin outline and a small handle; on selection the existing toolbar appears (move, duplicate, delete, add below). A "+" affordance between blocks opens the inserter. Double-click text to edit, as now.
4. **Inspector (right, 360px).** Three tabs:
   - **Block**: the fields of the selected block, in collapsed groups (Content, Media, Links, Advanced). Nothing selected shows the outline (list view) instead: a plain list of block names with drag handles, no buttons until hover.
   - **Page**: title, path, template, heading, breadcrumb, side column settings, banner, with each group collapsed.
   - **Section**: where the page sits, order of pages, navigation style, export section.
5. **Inserter.** One panel (from the "+" in the top bar or on the canvas) with search and category chips (Widgets, Content, Media, Forms, Data), each block as a small card with a one-line description. Recently used first.
6. **Pages screen.** A table, not cards: title, path, template chip, status chip, updated, section. Sections as collapsible group headers with a small count and a "⋯" for settings and export. Filters in one row; the explanatory paragraph becomes a "?" tooltip.
7. **Media screen.** Grid with hover actions only; selection by checkbox on hover; bulk bar appears at the bottom when something is selected.
8. **Visual language.** 8px spacing grid, one accent (Leeds red) reserved for the primary action and selection, neutral greys elsewhere, 13px UI font, icons from one set (Material, matching the design system's mdi icons), hints collapsed into "?" tooltips, toasts smaller and bottom-left.
9. **Empty states.** A new page shows a single "Add your first block" card on the canvas; a new project shows three starter tiles (homepage, document page, import a leeds.ac.uk page).
10. **Keyboard.** "/" in a rich text block opens the inserter at the caret; Ctrl+K link; Ctrl+S version; Ctrl+Shift+S project; Esc closes panels.

## Migration path

The data model and renderer need no change; this is a shell and sidebar rewrite.

1. ~~Rail and single top bar, with the current sidebar unchanged (half a day).~~ **Done 3 November 2026.** Icon rail with hover labels replaces the text navigation; every screen puts its title and actions in one white top bar; the editor's bar holds back, title, path, template, status, undo/redo, device icons, Preview/HTML, a save-state dot, Open page and a "⋯" menu (versions, exports, duplicate, delete, project file). The section strip is a single slim row. Undo and redo now refresh the title, path, template and status fields.
2. ~~Inspector: block fields for the selected block only; outline as the default sidebar (one day).~~ **Done 3 November 2026.** The panel moved to the right with three tabs. *Block* shows the outline (number, type, summary; grip and actions on hover) until a block is selected in the preview or the list, then that block's fields with a header (back, move, duplicate, delete, ⋯) and "Add a block below". *Page* holds heading and breadcrumb, banner, article/homepage options, the side-column groups and versions, all as collapsible groups. *Section* replaces the old strip: previous/next, the ordered page list (click a page to open it, drag to reorder), auto-navigation toggle, new page, remove, export and the navigation settings. Esc deselects. Fields are not yet split into Content/Media/Links/Advanced groups; each block's fields keep their defined order.
3. ~~Canvas "+" between blocks and the new inserter (half a day).~~ **Done 3 November 2026.** Hovering a block in the preview shows a dashed line with a red "+" at its lower edge (or upper edge when hovering the top of the block), which opens the inserter at that position. An empty page shows an "Add your first block" prompt in the canvas. The inserter has search (Enter inserts the first match), category chips, a "Recently used" row and a one-line description per block. A red "+" in the top bar inserts below the selected block or at the end.
4. ~~Pages table and media grid refresh (half a day).~~ **Done 3 November 2026.** Pages are a table per section (number, title with block count, path, template chip, status chip, updated, section dropdown) with Edit, Open and ⋯ (duplicate, page JSON, delete) appearing on hover. Section headers keep the collapse toggle, title and summary, with "+ Page" and a ⋯ menu (settings, open first page, the four export formats, remove). The media grid shows the checkbox and the copy/download/delete icons only on hover; the bulk bar is a dark strip fixed to the bottom of the window while something is selected. Esc closes any open menu.
5. ~~Visual polish, icons and tooltips, empty states (half a day).~~ **Done 3 November 2026.** Field hints are "?" tooltips beside the label instead of a line under every field. Toasts are smaller, bottom-left, with a coloured edge per kind. UI type is 13.5px. A new project shows three starter tiles on the Pages screen (Homepage, Document page, Import a leeds.ac.uk page); empty filters and an empty media library get a dashed empty state. Keyboard: "/" opens the inserter, and "/", Ctrl+Z, Ctrl+Y and Esc work while the preview has focus too; Ctrl+K inserts a link in rich text.

All five stages shipped. Still open from the proposal: grouping block fields into Content/Media/Links/Advanced, and "/" at the caret inside a rich text block.

Each step ships on its own, so the editor stays usable throughout.
