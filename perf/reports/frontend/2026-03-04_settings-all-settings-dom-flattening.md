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
