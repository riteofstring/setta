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
