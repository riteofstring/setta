# Canvas Engine Snapshot Order Cache Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `b9e0cba7e`
Related reports:

- `perf/reports/frontend/2026-03-04_incremental-edge-index-sync-optimization.md`
- `perf/reports/frontend/2026-03-04_snapshot-edge-adjacency-optimization.md`

## Goal

Remove per-frame sorting of visible sections and edges during snapshot creation by caching global z-ordered ID lists and filtering those lists per frame.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`

Key adjustments:

- Added cached ordered ID lists for:
  - section records
  - data-edge records
  - agentic-edge records
- Added ordering dirty flags and invalidation only on sort-affecting mutations:
  - add/remove records
  - z-index changes
- Updated `createSnapshot` to:
  - build visibility sets
  - iterate cached ordered IDs
  - filter by visibility
  - avoid per-snapshot `Array.sort` calls on visible records
- Added test coverage to verify snapshot ordering updates correctly after z-index changes.

## Verification Commands

- `pnpm -C frontend exec prettier --write src/canvas-engine/sceneAdapter.ts src/canvas-engine/sceneAdapter.test.ts`
- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`
- `chrome-devtools-mcp` page validation on `http://127.0.0.1:3005/lark_chasing` with `useCanvasEngineV1=true`

## Metrics (legacy large-canvas scenario)

Before (previous slice run):

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

After (this run):

### 100-section scenario

- `topLevelNodeCount=70`
- `canvasDomNodeCount=4532`
- `totalDomNodeCount=5163`
- `avgFrameMs=8.34`
- `p95FrameMs=9.40`
- `p99FrameMs=10.20`
- `maxFrameMs=10.30`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12669`
- `totalDomNodeCount=13992`
- `avgFrameMs=62.05`
- `p95FrameMs=516.70`
- `p99FrameMs=933.00`
- `maxFrameMs=958.40`

## Interpretation

- This change removes repeated sort work from the snapshot hot path and shifts ordering cost to apply-time invalidation events.
- In this baseline fixture, percentile frame metrics are mixed, but worst-tail values remain in the same range and DOM footprint is slightly lower in the 300-section case.
- Expected upside is larger in edge-dense scenes with frequent camera snapshots where visible-set sorting previously happened every frame.
