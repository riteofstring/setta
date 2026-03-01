# Canvas Engine Data-Edge Endpoint Hit-Test Index Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `cb5cff26d`
Related reports:

- `perf/reports/frontend/2026-03-04_edge-hit-test-spatial-index-optimization.md`
- `perf/reports/frontend/2026-03-04_data-handle-hit-test-spatial-query-optimization.md`

## Goal

Reduce reconnect endpoint hit-test cost by avoiding full data-edge scans in `hitTestDataEdgeEndpointAtWorldPoint`.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`

Key adjustments:

- Added a dedicated spatial index and record map for data-edge endpoints (source/target points).
- Extended edge-index rebuild to:
  - compute and index data-edge segment bounds (existing behavior)
  - index per-edge endpoint points keyed by edge+endpoint type
- Reworked `hitTestDataEdgeEndpointAtWorldPoint` to query endpoint candidates from the endpoint index and distance-filter only those candidates.
- Added regression coverage for endpoint hit-test reindexing after section geometry changes.

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

## Metrics (legacy large-canvas scenario)

Before (previous slice run):

### 100-section scenario

- `topLevelNodeCount=70`
- `canvasDomNodeCount=4589`
- `totalDomNodeCount=5223`
- `avgFrameMs=8.33`
- `p95FrameMs=9.10`
- `p99FrameMs=9.40`
- `maxFrameMs=9.40`

### 300-section scenario

- `topLevelNodeCount=203`
- `canvasDomNodeCount=12850`
- `totalDomNodeCount=14184`
- `avgFrameMs=53.09`
- `p95FrameMs=449.90`
- `p99FrameMs=990.80`
- `maxFrameMs=991.90`

After (this run):

### 100-section scenario

- `topLevelNodeCount=70`
- `canvasDomNodeCount=4503`
- `totalDomNodeCount=5130`
- `avgFrameMs=8.33`
- `p95FrameMs=9.10`
- `p99FrameMs=9.30`
- `maxFrameMs=9.30`

### 300-section scenario

- `topLevelNodeCount=202`
- `canvasDomNodeCount=12846`
- `totalDomNodeCount=14180`
- `avgFrameMs=58.95`
- `p95FrameMs=539.90`
- `p99FrameMs=1025.00`
- `maxFrameMs=1025.50`

## Interpretation

- This slice removes O(total data edges) work from endpoint hit testing and replaces it with local candidate queries.
- Baseline frame timings remain noisy run-to-run; the improvement target here is algorithmic complexity on reconnect endpoint interactions, especially with high edge counts.
