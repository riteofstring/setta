# Browser Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go`
  - `internal/projectstate/browser_sections.go`
  - `internal/projectstate/frontend_defaults.go`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Section/Layouts/BrowserAreaItemsColumn.tsx`
  - `frontend/src/components/Section/Layouts/BrowserAreaTypesColumn.tsx`
  - `frontend/src/components/Section/Layouts/BrowserAreaView.tsx`
  - `frontend/src/components/Section/Layouts/browserAreaShared.ts`
  - `frontend/src/components/Section/Layouts/BrowserArea.test.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPaneView.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserRow.tsx`
  - `frontend/src/utils/fileBrowserTypes.ts`
- Data shown:
  - Browser section impl fields: `folder`, `hideColumn`, `columnWidth`, `typesColumnWidth`, `viewMode`, and `savedSearches`.
  - Browser-local file-browser state: root path, path separator, ignore patterns, filter text, search scope, type filters, breadcrumbs, visible folder items, selected item, and folder/file metadata.
  - Saved searches with `id`, `name`, `query`, `searchScope`, `typeFilters`, `color`, and `quickInfo`.
  - File/folder rows with `name`, `fullPath`, `type`, modified time, selected/open state, expandable folders, draggable files, and preview categories.
- Controls/actions:
  - Header section controls from the shared shell.
  - Left type filter toggles for image, video, audio, text, and data/other, plus select-all reset.
  - Saved search apply affordances.
  - Folder history controls for back and forward, go-up control, path input, search/filter input, save-search action, breadcrumb selection, and list/thumbnail/carousel view selector.
  - Column resize affordances for the filter rail and file/date list columns.
  - List rows support selection, double-click/open, folder expansion, dragging files, and dropping onto folders.
- Important states:
  - `viewMode=list` as the primary rendered state, with thumbnail and carousel present as inactive view selector options.
  - `searchScope=recursive` and a non-empty filter query so recursive search behavior remains recognizable.
  - Visible type filters with image/text/data active and video/audio off.
  - Left filters column visible because `hideColumn=false`.
  - One selected file row and one expandable folder row.
- Interactions that must stay recognizable:
  - Browser is a two-region explorer when filters are visible: type/saved-search column plus main file area.
  - Path/filter controls sit above breadcrumbs and the file list.
  - View-mode controls stay near the path/filter toolbar.
  - List view has sortable file/date columns, row selection, folder expansion, file drag, and open affordances.

## Layout Invariants
- Conceptual regions and ordering:
  - Shared flat shell/titlebar outside the Browser-specific body.
  - Browser body contains a left filter/saved-search rail and a right main browser pane.
  - The main pane orders toolbar, breadcrumbs, and scroll-contained file list.
- Relative placement of important controls:
  - Filter type toggles and saved searches remain in the left rail.
  - Back/forward/up, path, filter, save-search, and view selector remain above breadcrumbs.
  - File/date headers remain above rows.
- Grouping/containment relationships:
  - Saved searches are grouped under type filters.
  - Breadcrumbs are grouped with navigation and path controls.
  - File rows are contained in the list viewport, not mixed with preview-page chrome.
- Scroll or overflow expectations:
  - The section is browser/explorer-sized, taller than compact sections.
  - The file list is the scroll-contained region; the shell and toolbar should not overflow.

## Intentional Differences
- What the flat prototype is allowed to change:
  - Uses flat prototype typography, borders, spacing, and compact controls instead of production rounded/Tailwind styling.
  - Uses static fixture rows and deterministic markup instead of live OpenAPI calls, virtualized rows, resize hooks, and Zustand state.
- What production layout logic is intentionally not reused:
  - Does not reuse production DOM structure, grid templates, resize measurements, React state hooks, virtualized `FileBrowserPane`, thumbnail/carousel components, or Tailwind class chains.
- Confirmation that the prototype is not fictional and is not an old-design lift:
  - Every displayed concept maps to Browser section fields, file-browser state, file-browser pane behavior, Browser saved-search data, or BrowserArea tests.
- Confirmation that every visible prototype affordance maps to real section behavior or data:
  - Type filters, saved searches, path/filter controls, breadcrumbs, view modes, list columns, row selection, folder expansion, file drag/open, and folder drop all map to inspected production behavior.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component:
  - The `Browser` label will be added only through `FlatPrototypeGalleryItem`, above the section shell.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed:
  - The Browser task will not edit Callable or Dict body fixtures, row hierarchy, controls, ports, or protected styling.

## Component Plan
- New files or functions:
  - Add Browser fixture types/data in `FlatSectionPrototype.tsx`.
  - Add `FlatBrowserSectionPrototype`, `FlatBrowserBody`, and small Browser-only rendering helpers.
  - Add Browser to the external gallery in both themes.
  - Add Browser-only CSS classes in `FlatSectionPrototype.css`.
- Static fixture data:
  - A `Workspace Browser` section with folder `/workspace/assets`, recursive filter `release`, active list view, visible filter rail, two saved searches, and five file/folder rows.
- Tests/verification:
  - Extend `FlatSectionPrototype.test.tsx` with gallery coverage, Browser markup assertions, protected-baseline non-containment checks, and CSS sizing/overflow assertions.
  - Run `pnpm -C frontend exec vitest run src/components/Section/Layouts/FlatSectionPrototype.test.tsx`.
  - Run CDP visual verification on `/internal/flat-section-prototype` when feasible.
