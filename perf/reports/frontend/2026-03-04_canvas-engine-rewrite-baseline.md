# Canvas Engine Rewrite Baseline (ReactFlow/XYFlow)

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / 24a32c66e (plus local uncommitted baseline test/report changes)
Related PR: n/a

## Goal

Establish a deterministic baseline before the ground-up canvas engine rewrite, with emphasis on:
- large-canvas DOM footprint
- frame pacing under repeated pan/zoom-style transform updates
- DevTools insight signals for DOM size and forced reflow hot spots

## Scenario

- Entry point (URL/route/screen):
  - Playwright: isolated project URL created per test run
  - CDP trace: `http://127.0.0.1:3005/elm_swift?__setta_backend_origin=http://127.0.0.1:8005`
- Steps to reproduce (deterministic):
  1. Create isolated config.
  2. Seed mixed sections with deterministic grid placement.
  3. Add nested structure by moving every 3rd leaf section under alternating `Group`/`ListRoot` parents.
  4. Run 180-frame transform stress loop using `useReactFlow.setState({ transform })`.
- Data set / project used:
  - Scenario A: 100 sections, 12 parents, 30 moved children
  - Scenario B: 300 sections, 30 parents, 90 moved children
  - Leaf types: `Callable`, `TextBlock`, `Code`, `Dict`, `Prompt`, `Chart`, `Draw`, `TaskBoard`, `Spreadsheet`, `MetaControl`
- Browser + OS:
  - Chromium (Playwright + Chrome DevTools MCP) on macOS (arm64)
- Notes:
  - No CPU/network throttling.
  - `Chat` sections were intentionally excluded from the fixture to avoid chat-state background polling skewing baseline measurements.

## Before (baseline)

- Measurement method:
  - Automated: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`
  - Manual profiling: `chrome-devtools-mcp` Performance trace + insights (`DOMSize`, `ForcedReflow`)

- Key metrics (Playwright baseline spec):
  - 100-section scenario:
    - `topLevelNodeCount`: 69
    - `canvasDomNodeCount`: 4504
    - `totalDomNodeCount`: 5131
    - frame timings:
      - `avgFrameMs`: 8.33
      - `p95FrameMs`: 9.20
      - `p99FrameMs`: 9.30
      - `maxFrameMs`: 9.40
    - JS heap:
      - `used`: 286,000,000 bytes
      - `total`: 386,000,000 bytes
  - 300-section scenario:
    - `topLevelNodeCount`: 201
    - `canvasDomNodeCount`: 12,748
    - `totalDomNodeCount`: 14,078
    - frame timings:
      - `avgFrameMs`: 60.33
      - `p95FrameMs`: 515.80
      - `p99FrameMs`: 950.10
      - `maxFrameMs`: 966.70
    - JS heap:
      - `used`: 553,000,000 bytes
      - `total`: 842,000,000 bytes

- Key metrics (CDP trace on 300-like fixture):
  - Current DOM counts at capture time:
    - `topLevelNodeCount`: 205
    - `visibleSectionDomCount`: 277
    - `canvasDomNodeCount`: 12,939
    - `totalDomNodeCount`: 14,284
  - Insight `DOMSize`:
    - Total elements: 14,402
    - Max DOM depth: 30
    - Largest child count on one parent: 296
    - Style recalculation events observed up to ~205 ms
  - Insight `ForcedReflow`:
    - Total forced reflow time: 610 ms
    - Includes `getHandleCenter` in `src/state/actions/edgeHandles.ts`
    - Includes heavy time in equality work (`lodash eq` path), indicating high update/comparison cost under large DOM/state pressure

- Observations:
  - DOM size is already in the 14k-element range for the 300-section fixture.
  - Frame-time tail latency is severe in the 300-section scenario (very high p95/p99), even when average frame time remains moderate.
  - Forced reflow and geometry querying remain visible in traces and align with known edge handle measurement pathways.

## After

(To be appended after rewrite milestones land. Baseline-only entry for now.)

- Key metrics:
- Observations:

## Conclusion

- What improved:
  - n/a (baseline entry)
- What regressed (if any) + why it is acceptable:
  - n/a
- Follow-ups:
  - Add milestone-by-milestone append entries for:
    1. engine skeleton
    2. scene adapter
    3. GPU edge rendering
    4. DOM-island virtualization
    5. hard cutover

## Raw Artifacts (local-only)

- Playwright run logs:
  - `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T//setta-e2e-logs-setta.frontend-performance-5-20260304-072503/`
- CDP trace:
  - Captured via `chrome-devtools-mcp` (`performance_start_trace` / `performance_stop_trace`) on `NO_NAVIGATION` insight set

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`
- Vitest test(s) / bench(es):
  - none added in this step
- Budgets/assertions added:
  - Broad baseline guardrails for:
    - minimum top-level node materialization for 100/300 fixtures
    - canvas DOM count sanity
    - frame sample count and coarse frame-time ceilings
