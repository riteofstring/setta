# Section Types Data Authoring Performance Report (2026-02-14)

## Scope
- Text block master font size controls and markdown/plaintext scaling.
- Text param date/time normalization and formatting paths.
- List/group default child type configuration and incrementer flow.
- Callable section "allow unquoted string args" configuration toggle.

## Environment
- Worktree: `section-types-data-authoring`
- Frontend dev server: `http://127.0.0.1:3097`
- Backend dev server: `http://127.0.0.1:8097`
- Chrome DevTools MCP trace capture with no CPU/network throttling.

## Automated Performance Tests
Command:
```bash
pnpm -C frontend exec vitest run src/utils/sectionTypesDataAuthoring.performance.test.ts
```

Result:
- `2 passed`
- Guardrails exercised:
  - 40k date/time normalize+format iterations under 1400ms budget.
  - 200k text typography scale derivations under 700ms budget.

## DevTools Trace
Trace artifact:
- `perf/artifacts/2026-02-14-section-types-data-authoring-cdp-trace.json`

Captured interaction window:
- Text block master font slider adjustments.
- List-root default-child dropdown updates.
- Callable string-args toggle interaction.

Top insight from DevTools:
- `ForcedReflow` detected.
- Reported total reflow time: `56ms`.
- Notable frame: `eq` in `chunk-MB4RGFJ3.js` reported at `81ms` (includes layout-triggering work within the trace window).

Other trace summary data:
- CLS: `0.00`
- Insight set: `NO_NAVIGATION`

## Notes
- The measured forced reflow is bounded to interactive configuration updates and did not block completion of the tested flows.
- Existing automated perf tests now cover core utility hot paths introduced by this feature set.

## 2026-02-14 Update: ListRoot View Modes + CSV/XLSX Authoring

### Scope
- ListRoot `task_list` / `kanban` rendering and drag-orientation behavior.
- CSV/XLSX preview + basic editing in:
  - Overview File Browser side pane.
  - Browser section carousel universal preview pane.

### Environment
- Worktree: `section-types-data-authoring`
- Frontend dev server: `http://127.0.0.1:3911`
- Backend dev server: `http://127.0.0.1:9011`
- Chrome DevTools MCP trace capture with no CPU/network throttling.

### Automated Performance Tests
Command:
```bash
pnpm -C frontend exec vitest run \
  src/utils/spreadsheet.perf.test.ts \
  src/state/actions/sectionInfos.listRootViewMode.perf.test.ts
```

Result:
- `2 passed`
- Guardrails exercised:
  - parse + serialize of a 1200x24 XLSX model under 2500ms budgets.
  - ListRoot orientation computation over large section sets under 250ms.

Additional carousel perf/interaction smoke checks:
```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/file-browser/browser-carousel-scroll.spec.ts \
  frontend/tests/e2e/file-browser/browser-carousel-resize.spec.ts
```

Result:
- `2 passed`
- Includes thumbnail-strip scroll responsiveness assertion (`< 1500ms`) in carousel mode.

### DevTools Trace (Browser Spreadsheet Carousel)
Trace artifact:
- `perf/artifacts/2026-02-14-section-types-data-authoring-browser-spreadsheet-cdp-trace.json`

Captured interaction window:
- Select large CSV (`cdp-large-sheet.csv`) in browser carousel preview.
- Switch to XLSX (`cdp-sheet.xlsx`) preview.
- Edit spreadsheet cell and save.

Top insights from DevTools:
- `INP`: `439ms` (`pointerdown`)
  - Input delay: `2ms`
  - Processing duration: `398ms`
  - Presentation delay: `40ms`
- `ForcedReflow` detected:
  - total reflow time: `264ms`
  - top callsite in `react-window` during virtualized spreadsheet interaction.
- `CLS`: `0.00`

### Notes
- The largest interaction cost is processing-heavy work on spreadsheet preview switch/update; no layout shift regressions were observed.
- Virtualized row rendering kept the browser-section spreadsheet preview usable on a 2k-row CSV while preserving edit/save flow.

## 2026-02-14 Follow-up: Overview Bottom Universal Preview Pane

### Scope
- Replaced side-by-side spreadsheet panel in Overview File Browser with a bottom universal preview pane.
- Unified preview routing in the bottom pane for spreadsheet, PDF, image, audio, video, and text files.

### Automated Performance Tests
Command:
```bash
pnpm -C frontend exec vitest run \
  src/utils/spreadsheet.perf.test.ts \
  src/state/actions/sectionInfos.listRootViewMode.perf.test.ts
```

Result:
- `2 passed`
- Spreadsheet parse/serialize budget guardrail remained within thresholds after preview-layout refactor.

### Playwright Verification
Command:
```bash
./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor/section-types-data-authoring.spec.ts
```

Result:
- `4 passed`
- Includes bottom-pane placement assertion (preview pane Y-position below list pane) plus CSV/XLSX/PDF preview path checks in the unified pane.

## 2026-02-14 Follow-up: Dedicated Clock/Calendar/TaskBoard/Spreadsheet Sections + Resizable Preview Pane

### Scope
- Added dedicated section renderers and section-config panels for:
  - `Clock`
  - `Calendar`
  - `TaskBoard`
  - `Spreadsheet`
- Added explorer-file-browser universal preview controls:
  - Bottom-pane resize handle.
  - Preview pane minimize/expand toggle.

### Automated Performance Tests
Command:
```bash
pnpm -C frontend exec vitest run \
  src/utils/sectionTypesDataAuthoring.performance.test.ts \
  src/utils/spreadsheet.perf.test.ts \
  src/state/actions/sectionInfos.listRootViewMode.perf.test.ts \
  src/utils/calendarGrid.perf.test.ts \
  src/utils/taskBoard.perf.test.ts
```

Result:
- `5 files passed`, `6 tests passed`.
- Guardrails exercised:
  - calendar month-grid generation loop within budget.
  - task-board lane normalization/grouping within budget.
  - previously established section-type/list-root/spreadsheet perf budgets remained passing.

### Playwright Verification
Commands:
```bash
./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor/section-types-data-authoring.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-carousel-spreadsheet-preview.spec.ts
```

Result:
- `section-types-data-authoring.spec.ts`: `5 passed`
  - Includes dedicated section visibility + interaction checks for clock/calendar/task-board/spreadsheet.
  - Includes bottom-preview resize and minimize/expand behavior checks.
- `browser-carousel-spreadsheet-preview.spec.ts`: `1 passed`

### DevTools MCP Profiling
- Attempted to run `chrome-devtools-mcp` profiling, but MCP transport was unavailable in this session (`Transport closed`), so no new trace artifact was captured for this follow-up run.

## 2026-02-14 Rerun After Reset: Explorer Universal Preview + Dedicated Sections

### Scope
- Re-verified bottom universal preview behavior in Explorer:
  - CSV/XLSX preview rendering in the bottom pane.
  - Inline spreadsheet edit + save path.
  - Preview-pane resize handle.
  - Preview-pane minimize/expand toggle.
- Re-verified dedicated section coverage (`Clock`, `Calendar`, `TaskBoard`, `Spreadsheet`) through automated E2E flow.

### Automated Test Rerun
Commands:
```bash
pnpm -C frontend exec vitest run \
  src/components/Panes/Overview/FileBrowser/FileBrowserWorkspace.test.ts \
  src/components/Panes/UiEditor/SectionConfig/SectionDataAuthoringSettings.test.tsx \
  src/utils/spreadsheet.test.ts \
  src/utils/spreadsheet.perf.test.ts \
  src/utils/taskBoard.test.ts \
  src/utils/taskBoard.perf.test.ts \
  src/utils/calendarGrid.test.ts \
  src/utils/calendarGrid.perf.test.ts

./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor/section-types-data-authoring.spec.ts
```

Result:
- Vitest: `8 passed`, `26 tests passed`.
- Playwright: `5 passed`.
  - Includes dedicated section visibility/interactivity test for clock/calendar/task-board/spreadsheet.
  - Includes bottom universal preview behavior checks for CSV/XLSX/PDF.

### DevTools Trace (Saved Artifact)
Trace artifact:
- `perf/artifacts/2026-02-14-section-types-data-authoring-explorer-universal-preview-cdp-trace.json`

Captured interaction window:
- Switch between XLSX and CSV files in Explorer.
- Spreadsheet cell edit + save.
- Bottom preview resize drag.
- Preview minimize/expand toggle.

Top insights from DevTools:
- `INP`: `90ms` (`pointerdown`)
  - Input delay: `0.7ms`
  - Processing duration: `51ms`
  - Presentation delay: `39ms`
- `CLS`: `0.00`

### Notes
- This rerun confirms the previously implemented Explorer bottom-pane UX and dedicated data-authoring section flows in a clean post-reset session.

## 2026-02-14 Follow-up: File Browser Move/Copy + Drag-Drop Section Launch

### Scope
- Added file-browser entry transfer endpoint (`copy` / `move`) for workspace files and folders.
- Added in-browser file operations:
  - Drag file/folder rows into folder rows to move entries.
  - Keyboard clipboard operations in file browser (`Cmd/Ctrl+C`, `Cmd/Ctrl+X`, `Cmd/Ctrl+V`).
- Added drag-drop interoperability:
  - Drag file-browser files to canvas to create spreadsheet/code/image sections.
  - Drag file-browser files into spreadsheet sections to set/load file paths.
  - Unsupported binary drops show a warning notification.

### Automated Performance + Regression Tests
Commands:
```bash
source activate.sh && pytest tests/routers/test_file_browser_routes.py -q

pnpm -C frontend exec vitest run \
  src/utils/fileBrowserDragPayload.test.ts \
  src/utils/fileDropSectionKind.test.ts \
  src/utils/fileDropSectionKind.perf.test.ts \
  src/utils/fileBrowserPathRelation.test.ts \
  src/utils/fileBrowserPathRelation.perf.test.ts

./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/file-browser/browser-transfer-and-drop.spec.ts
```

Result:
- Pytest: `34 passed`.
- Vitest: `5 files passed`, `11 tests passed`.
  - Includes path-relation + section-kind throughput guardrails.
- Playwright: `2 passed`.
  - Covers canvas drop section creation, spreadsheet-drop file loading, folder/file move by drag-drop, and copy/paste duplication behavior.

### DevTools Trace (Explorer/File Browser interactions)
Trace artifact:
- `perf/artifacts/2026-02-14-file-browser-transfer-cdp-trace.json`

Captured interaction window:
- Folder row select/expand interactions.
- Explorer preview minimize/expand interaction.
- Browser-section file search input update/clear.

Top insights from DevTools:
- `INP`: `155ms` (`pointerdown`)
  - Input delay: `2ms`
  - Processing duration: `118ms`
  - Presentation delay: `35ms`
- `CLS`: `0.00`
- `ForcedReflow` reported:
  - total reflow time: `344ms`
  - one interaction path references `FileBrowserPane.tsx` (`onMouseDown`) and existing column-width drag logic.

### Notes
- New transfer/move functionality is covered by backend unit tests plus end-to-end browser automation.
- The trace shows acceptable interaction latency for the exercised flow, with reflow pressure concentrated in existing resize/list mechanics rather than the new transfer endpoint path itself.
