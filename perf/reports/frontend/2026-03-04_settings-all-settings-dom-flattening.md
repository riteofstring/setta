# Settings All Settings Pan/Zoom DOM Flattening

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-6 @ 414a63c38 (baseline capture)
Related PR: n/a

## Goal

Improve zoom/pan responsiveness in the React Flow canvas for `/settings` -> `All Settings` by flattening DOM structure without changing behavior.

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3006/settings`
- Steps to reproduce (deterministic):
  1. Open `/settings`.
  2. Ensure `All Settings` tab is active.
  3. Record trace while running scripted pan/zoom interaction:
     - repeated wheel-pan phases;
     - 8x zoom out via toolbar control;
     - repeated wheel-pan phases;
     - 8x zoom in via toolbar control.
- Data set / project used: built-in Settings project (`All Settings` view mode).
- Browser + OS: Chrome (DevTools MCP), macOS.
- Notes: no CPU/network throttling.

## Before (baseline)

- Measurement method:
  - Chrome DevTools MCP trace (`performance_start_trace` / `performance_stop_trace`).
  - In-page DOM metric sampling via `evaluate_script` on `.react-flow__viewport` and `.react-flow__node`.
- Key metrics:
  - DOM:
    - React Flow nodes: `42`
    - Viewport descendants: `8619`
    - Param rows (`[data-param-row="true"]`): `697`
    - Per-node descendants: `avg 204.05`, `p95 314`, `max 1854`
    - Per-node max depth: `avg 12.74`, `p95 13`, `max 17`
  - Trace window (derived from `TracingStartedInBrowser` to trace end):
    - Duration: `22,943.57 ms`
    - Renderer main `RunTask` count: `5861`
    - Renderer main long tasks (`>=50ms`): `2`
    - Renderer main tasks over frame budget (`>=16.67ms`): `114`
    - Renderer main max task duration: `557.64 ms`
    - Frame signals:
      - `BeginFrame`: `530` (`23.1/s`)
      - `DrawFrame`: `163` (`7.1/s`)
      - `DroppedFrame`: `304` (`57.36%` of BeginFrame)
    - Main-thread rendering work:
      - `Layout`: `71.84 ms`
      - `UpdateLayoutTree`: `16.2 ms`
      - `Paint`: `79.05 ms`
      - `PrePaint`: `16.3 ms`
- Observations:
  - DOM size is high for this view, with one section node reaching `1854` descendants.
  - Dropped-frame count is substantial in the measured interaction window.

## After

### Phase 1 (wrapper flattening pass)

- Scope:
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`
  - `frontend/src/components/Section/Container/ManyNestedSections.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `7838` (down from `8619`, `-781`, `-9.1%`)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 185.45` (down from `204.05`)
  - Per-node descendants p95: `290` (down from `314`)
  - Per-node descendants max: `1656` (down from `1854`)
  - Per-node max depth: `avg 11.74` / `max 16` (down from `12.74` / `17`)
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase1.trace.json`
- Trace signals from this phase run:
  - Duration: `18,026.11 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `4`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `325` (`18.03/s`)
  - `DrawFrame`: `171` (`9.49/s`)
  - `DroppedFrame`: `21` (`6.46%`)
  - Main-thread work: `Layout 82.67 ms`, `UpdateLayoutTree 18.22 ms`, `Paint 139.61 ms`
- Notes:
  - DOM-shape improvements are clear and stable in this pass.
  - Trace-window duration differs from baseline, so final comparison should be re-run once after all flattening passes land.

## Conclusion

- Pending refactor and post-change measurements.

## Raw Artifacts (local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_baseline.trace.json`

## Automated Perf Tests

- Planned:
  - Add a Playwright settings pan/zoom DOM-structure guardrail under `frontend/tests/e2e/settings/`.

## After (continued)

### Phase 2 (resize-handle flattening)

- Scope:
  - `frontend/src/components/Params/ResizeHandle.tsx`
- Change:
  - Flattened each resize handle from nested wrapper structure to a single interactive element with pseudo-elements.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `6584` (down from `7838`, `-1254`, `-16.0%` vs phase 1)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 155.6`, `p95 198`, `max 1344`
  - Per-node max depth: `avg 11.74`, `max 16` (unchanged vs phase 1)
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2.trace.json`
- Trace signals from this phase run:
  - Duration: `15,017.26 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `3`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `223` (`14.85/s`)
  - `DrawFrame`: `96` (`6.39/s`)
  - `DroppedFrame`: `17` (`7.62%`)
  - Main-thread work: `Layout 33.56 ms`, `UpdateLayoutTree 8.06 ms`, `Paint 55.48 ms`, `PrePaint 7.72 ms`

### Phase 3 (text/password border-span flattening)

- Scope:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- Change:
  - Removed dedicated border `<span>` nodes for text/password params.
  - Moved equivalent border/focus styles onto existing input wrapper elements.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `6158` (down from `6584`, `-426`, `-6.5%` vs phase 2)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 145.45`, `p95 186`, `max 1218`
  - Per-node max depth: `avg 11.74`, `max 16` (unchanged)
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3b.trace.json`
- Notes on trace reliability:
  - Initial phase 3 run (`phase3`) started from a fit-view state where zoom controls differed; use `phase3b` for normalized comparison.
- Trace signals from normalized run (`phase3b`):
  - Duration: `15,575.42 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `8`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `350` (`22.47/s`)
  - `DrawFrame`: `98` (`6.29/s`)
  - `DroppedFrame`: `72` (`20.57%`)
  - Main-thread work: `Layout 27.8 ms`, `UpdateLayoutTree 7.11 ms`, `Paint 35.73 ms`, `PrePaint 7.42 ms`

## Conclusion (update)

- DOM flattening delivered a large structural reduction in the benchmark view.
- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 6158` (`-2461`, `-28.6%`)
  - Per-node descendants avg: `204.05 -> 145.45` (`-28.7%`)
  - Per-node descendants max: `1854 -> 1218` (`-34.3%`)
  - Per-node depth avg/max: `12.74/17 -> 11.74/16`
- Runtime traces remain somewhat variable run-to-run, but main-thread layout/paint totals dropped materially vs baseline.

## Raw Artifacts (additional local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase1.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2_fitview.png`

## After (continued)

### Phase 4 (nested param wrapper flattening)

- Scope:
  - `frontend/src/components/Params/ParamContainer.tsx`
- Change:
  - Removed the always-rendered nested-child wrapper around `GetParamSwitch` in the nested-param branch.
  - Moved connector pseudo-element styling onto the parent nested article row.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `6088` (down from `6158`, `-70`, `-1.1%` vs phase 3)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 143.79`, `p95 183`, `max 1178`
  - Per-node max depth: `avg 11.38`, `max 14`
  - Nested connector wrappers (previous class pattern): `0` (down from `70`)
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4.trace.json`
- Trace signals from this phase run:
  - Duration: `18,703.01 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `3`
  - `BeginFrame`: `429` (`22.94/s`)
  - `DrawFrame`: `122` (`6.52/s`)
  - `DroppedFrame`: `42` (`9.79%`)
  - Main-thread work: `Layout 28.21 ms`, `UpdateLayoutTree 7.47 ms`, `Paint 82.24 ms`, `PrePaint 7.19 ms`

### Guardrail Automation

- Added automated structural benchmark guardrail:
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Guardrails enforced in test:
  - viewport descendant budget
  - total element budget
  - per-node descendant budgets
  - max node depth budget
  - zero count for known removed wrapper patterns (`group/resize`, value-border spans)

## Conclusion (latest)

- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 6088` (`-2531`, `-29.4%`)
  - Per-node descendants avg: `204.05 -> 143.79` (`-29.5%`)
  - Per-node descendants max: `1854 -> 1178` (`-36.5%`)
  - Per-node depth avg/max: `12.74/17 -> 11.38/14`
- DOM flattening now has both manual profiling artifacts and an automated E2E structural guardrail.

## Raw Artifacts (additional local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4_fitview.png`
