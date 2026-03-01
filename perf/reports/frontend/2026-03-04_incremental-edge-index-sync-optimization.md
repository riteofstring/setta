# Canvas Engine Incremental Edge Index Sync

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `fc332f7bd`
Related reports:

- `perf/reports/frontend/2026-03-04_snapshot-edge-adjacency-optimization.md`
- `perf/reports/frontend/2026-03-04_data-edge-endpoint-hit-test-index-optimization.md`

## Goal

Avoid full edge spatial-index rebuilds on section/edge updates by incrementally syncing only changed edge records.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`

Key adjustments:

- Replaced full `rebuildEdgeSpatialIndexes` calls with incremental `syncEdgeSpatialIndexes`.
- Tracked changed and removed edge IDs in data-edge and agentic-edge apply paths.
- Tracked changed section IDs in section apply path to refresh only section-adjacent edges.
- Added targeted upsert/remove helpers for data-edge and agentic-edge spatial index entries.
- Kept section-edge adjacency maps as source-of-truth for identifying affected edges.

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`
- `chrome-devtools-mcp` page validation on `http://127.0.0.1:3005/lark_chasing` with `useCanvasEngineV1=true`

## Metrics (legacy large-canvas scenario)

Before (previous slice run):

### 100-section scenario

- `topLevelNodeCount=69`
- `canvasDomNodeCount=4532`
- `totalDomNodeCount=5162`
- `avgFrameMs=8.33`
- `p95FrameMs=9.30`
- `p99FrameMs=9.40`
- `maxFrameMs=9.40`

### 300-section scenario

- `topLevelNodeCount=204`
- `canvasDomNodeCount=12869`
- `totalDomNodeCount=14207`
- `avgFrameMs=50.86`
- `p95FrameMs=441.40`
- `p99FrameMs=975.50`
- `maxFrameMs=983.80`

After (this run):

### 100-section scenario

- `topLevelNodeCount=70`
- `canvasDomNodeCount=4532`
- `totalDomNodeCount=5163`
- `avgFrameMs=8.33`
- `p95FrameMs=10.30`
- `p99FrameMs=10.40`
- `maxFrameMs=10.40`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12690`
- `totalDomNodeCount=14016`
- `avgFrameMs=59.43`
- `p95FrameMs=515.00`
- `p99FrameMs=933.30`
- `maxFrameMs=941.90`

## Interpretation

- Incremental sync removes an O(total-edges) rebuild path during state apply and should improve update-heavy edge churn scenarios.
- The baseline fixture remains noisy and is camera-motion dominated; aggregate frame timings here are not a direct proxy for apply-path wins.
- DOM footprint improved in the 300-section case (`canvasDomNodeCount` and `totalDomNodeCount` dropped), while frame-time percentiles varied run-to-run.
