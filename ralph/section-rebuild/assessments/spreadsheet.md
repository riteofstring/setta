# Spreadsheet Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected
  - `internal/projectstate/frontend_section_codeobj_contracts.go` defines `FrontendSpreadsheetSectionImpl`.
  - `internal/projectstate/section_data_settings.go` defines file path and settings mutations.
  - `internal/settingsstate/defaults.json`, `frontend/src/utils/generatedTypes.ts`, and `internal/projectstate/auto_layout.go` define defaults and broad sizing.
  - `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx` owns the section wrapper, file drop handling, and lazy editor mount.
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx` and `fileBrowserSpreadsheetGrid.tsx` define the editor affordances.
  - `frontend/src/components/Section/Layouts/SpreadsheetArea.test.tsx` verifies supported drops and persisted file paths.
- Data shown
  - Bound workspace/native spreadsheet file path and derived file name.
  - Active sheet name, row count, column count, row-number setting, density, read-only state, auto-reload state, dirty/external-change/status states, filter query, sort column/direction, selected cell range, and visible grid cells.
  - Supported file formats are CSV, TSV, XLS, and XLSX.
- Controls/actions
  - Section shell controls from the flat prototype shell remain available.
  - Spreadsheet-specific controls map to the real toolbar and editor: filter rows, choose sort column, toggle sort direction, clear view, add column, add row, reload, save, and mobile/settings menu concept.
  - Section-level drop target affordance maps to workspace and native spreadsheet file drops.
  - Grid affordances map to editable cells, row numbers, column headers, column resize in Glide mode, selection, delete/paste/edit behavior, and read-only disabling.
- Important states
  - No file/invalid file empty-state messaging.
  - Loading and unable-to-load editor states.
  - Read-only, unsaved edits, file changed on disk, saved/status, and error banners.
  - Dirty file where Save is available, compact density with row numbers shown, and auto-reload enabled.
- Interactions that must stay recognizable
  - Dropping a supported spreadsheet file binds `filePath` and preserves `activeSheet`.
  - Editing cells marks the draft dirty; Save serializes the workbook and writes back to the selected file.
  - Reload re-reads the file; auto-reload watches external changes when enabled.
  - Filtering and sorting change the displayed row set without changing the source data.
  - Selection summary and row/column counts update in the footer.

## Layout Invariants
- Conceptual regions and ordering
  - Flat section titlebar first, then Spreadsheet body.
  - Body contains a compact file/status strip, a spreadsheet toolbar, a status banner, the primary grid viewport, and a footer summary.
  - The grid is the dominant region and must be taller than the toolbar/status/footer.
- Relative placement of important controls
  - File identity and active sheet are above or adjacent to editor controls.
  - Filter/sort controls appear in the toolbar before mutation actions.
  - Add row/column, reload, and save actions remain grouped at the toolbar edge.
  - Status messages sit between toolbar and grid.
  - Row/column count and selection summary sit below the grid.
- Grouping/containment relationships
  - File/drop/settings metadata is separate from cell grid content.
  - Column headers and optional row-number gutter are part of the grid.
  - Visible cells are contained inside the scrollable grid viewport.
  - Footer summarizes the same loaded sheet shown in the grid.
- Scroll or overflow expectations
  - The section has a broad Spreadsheet default size, with minimum sizing around the real section's `420x260` floor and default `760x500` shape.
  - The grid viewport owns overflow; toolbar, banner, and footer should not scroll or clip text.

## Intentional Differences
- What the flat prototype is allowed to change
  - The prototype uses static HTML/CSS and the flat section shell/titlebar instead of the production rounded editor card and Tailwind styling.
  - It shows representative static grid cells and statuses rather than mounting Glide Data Grid, reading files, or running OpenAPI calls.
- What production layout logic is intentionally not reused
  - The prototype does not reuse production DOM structure, Tailwind class chains, `react-window`, Glide Data Grid, resize observers, density measurement helpers, lazy imports, or OpenAPI wiring.
- Confirmation that the prototype is not fictional and is not an old-design lift
  - The fixture concepts are all real Spreadsheet section fields, editor state, toolbar controls, and grid affordances from the inspected source files.
  - The layout keeps the real broad editor relationships while expressing them in the accepted flat prototype language.
- Confirmation that every visible prototype affordance maps to real section behavior or data
  - File path, active sheet, read-only, row numbers, density, auto-reload, filter, sort, clear, add row, add column, reload, save, status banner, grid headers, row-number gutter, editable cells, column resize, selection, footer summary, and drop target all map to inspected behavior.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component
  - The `Spreadsheet` label will be added only through `FlatPrototypeGalleryItem`, above the rendered section shell.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed
  - Callable and Param Dict/Dict component bodies, fixtures, row hierarchy, controls, ports, spacing, and styling will be left untouched.

## Component Plan
- New files or functions
  - Add Spreadsheet fixture/type helpers and `FlatSpreadsheetBody` to `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
  - Add `FlatSpreadsheetSectionPrototype` export and gallery entries for dark/light previews.
  - Add prototype-only Spreadsheet CSS selectors in `FlatSectionPrototype.css`.
  - Add focused tests to `FlatSectionPrototype.test.tsx`.
- Static fixture data
  - A loaded `forecast.xlsx` file with active sheet `Q2 Forecast`, compact density, row numbers, auto-reload on, dirty/external-change state, filter query, sort state, three visible rows, four columns, one selected range, and representative cells.
- Tests/verification
  - Focused Vitest render assertions for Spreadsheet markup, external gallery label, and protected-baseline isolation.
  - CSS assertions for Spreadsheet sizing and contained grid overflow.
  - Run `pnpm -C frontend exec vitest run src/components/Section/Layouts/FlatSectionPrototype.test.tsx`.
  - Run CDP visual verification on `/internal/flat-section-prototype` when feasible.
