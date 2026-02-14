# CSV/XLSX View And Basic Edit

## Goal
Allow CSV/XLSX files to be viewed and lightly edited with a styleable grid/table library.

## Scope
- In scope: file load, tabular rendering, basic cell edit, save/update workflow.
- Out of scope: spreadsheet-level advanced formulas/macros.

## Plan
1. Evaluate and select a styleable table/grid library compatible with app constraints.
2. Implement CSV/XLSX parse -> table model -> render pipeline.
3. Add basic cell editing and save-back flow with validation.
4. Ensure large-sheet performance and virtualization where needed.

## Acceptance Criteria
- CSV/XLSX files are viewable in a tabular UI.
- Basic edits can be made and persisted where supported.

## Verification
- Add unit tests for parser/serializer behavior.
- Add Playwright flow for open/edit/save common CSV/XLSX files.
- CDP visual and performance check on large tables.

## Completion (2026-02-14)
- Added spreadsheet parsing/serialization utilities with `xlsx`:
  - CSV/TSV/XLS/XLSX read/write
  - normalized row/column model
  - extension detection + spreadsheet column labels
- Implemented reusable spreadsheet editor pane with:
  - virtualized rows (`react-window`)
  - inline cell edits
  - add row / add column
  - save with mtime conflict checks via `/writeFileBrowserFileContent`
- Integrated editor in two places:
  - Overview File Browser as a dedicated side pane (`FileBrowserWorkspace`)
  - Browser section carousel preview pane (same universal preview area as PDF/image/audio/video)
- Browser section open behavior now routes CSV/XLSX files to carousel spreadsheet preview/edit instead of opening as code.

## Completed Verification (2026-02-14)
- Backend pytest:
  - `tests/routers/test_file_browser_routes.py`
- Vitest:
  - `frontend/src/utils/spreadsheet.test.ts`
  - `frontend/src/utils/spreadsheet.perf.test.ts`
- Playwright:
  - `frontend/tests/e2e/editor/section-types-data-authoring.spec.ts` (`file browser spreadsheet panel edits csv and previews xlsx`)
  - `frontend/tests/e2e/file-browser/browser-carousel-spreadsheet-preview.spec.ts`
- CDP:
  - visual verification completed for browser carousel + overview spreadsheet panes.
  - performance trace captured for large CSV/XLSX preview/edit interactions.

## Follow-up (2026-02-15)
- Kept spreadsheet scope focused on data-grid display/edit, not spreadsheet-app parity.
- Added section-level programmable grid settings:
  - `readOnly`
  - `showRowNumbers`
  - `density` (`compact` / `comfortable`)
  - `autoReloadOnExternalChange`
- Added backend route + listener wiring: `setSpreadsheetSectionSettings`.
- Updated spreadsheet section settings pane to control those fields directly; removed manual file-path input from section config (file binding remains drag/drop/browser-driven).
