# Canvas Engine Edge Hit-Test Spatial Index Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `11b03c39f`
Related reports:

- `perf/reports/frontend/2026-03-04_data-handle-hit-test-spatial-query-optimization.md`
- `perf/reports/frontend/2026-03-04_connected-data-handle-selector-optimization.md`

## Goal

Reduce pointer-hover and pointer-down edge hit-test work by avoiding full edge-map scans and querying only candidate edges near the pointer.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`

Key adjustments:

- Added dedicated spatial indexes for data edges and agentic edges.
- Reworked `hitTestEdgeAtWorldPoint` to query candidate edge IDs from these indexes in a tolerance-expanded world window.
- Added edge-index rebuild flow that runs when:
  - section bounds change
  - data edge set/anchor state changes
  - agentic edge set changes
- Added line-segment bounds helper used for edge index records.
- Added unit coverage for:
  - long data-edge hit testing far away from section bounds
  - edge hit-test reindexing after section geometry changes

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

## Metrics (legacy large-canvas scenario)

Before (previous slice run):

### 100-section scenario

- `topLevelNodeCount=70`
- `canvasDomNodeCount=4504`
- `totalDomNodeCount=5131`
- `avgFrameMs=8.28`
- `p95FrameMs=9.20`
- `p99FrameMs=9.30`
- `maxFrameMs=9.40`

### 300-section scenario

- `topLevelNodeCount=202`
- `canvasDomNodeCount=12698`
- `totalDomNodeCount=14024`
- `avgFrameMs=66.43`
- `p95FrameMs=550.20`
- `p99FrameMs=1004.50`
- `maxFrameMs=1050.00`

After (this run):

### 100-section scenario

- `topLevelNodeCount=69`
- `canvasDomNodeCount=4504`
- `totalDomNodeCount=5131`
- `avgFrameMs=8.33`
- `p95FrameMs=9.20`
- `p99FrameMs=9.30`
- `maxFrameMs=9.40`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12697`
- `totalDomNodeCount=14023`
- `avgFrameMs=64.79`
- `p95FrameMs=566.70`
- `p99FrameMs=987.50`
- `maxFrameMs=1058.40`

## Interpretation

- This slice targets edge hover/click hit-test search cost by replacing full-map scans with spatial candidates.
- Broad timing remains noisy in this stress fixture, but interaction parity remained intact across the full canvas-engine host suite.
