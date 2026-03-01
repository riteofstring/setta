# Canvas Engine Snapshot Edge-Adjacency Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `fb6b7c260`
Related reports:

- `perf/reports/frontend/2026-03-04_edge-hit-test-spatial-index-optimization.md`
- `perf/reports/frontend/2026-03-04_data-handle-hit-test-spatial-query-optimization.md`

## Goal

Reduce camera-update snapshot work by avoiding full edge-map scans when resolving visible data/agentic edges.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`

Key adjustments:

- Added per-section edge adjacency maps for data edges and agentic edges.
- Updated snapshot generation to:
  - collect visible edge IDs from visible section IDs via adjacency lookups
  - fetch/sort only those edge records
  - avoid iterating every edge on each camera-driven snapshot rebuild
- Kept active-section semantics intact by still including active offscreen sections in the visible section set before edge collection.
- Added test coverage for active offscreen edge inclusion to guard parity behavior.

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

## Metrics (legacy large-canvas scenario)

Before (previous slice run):

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

After (this run):

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

## Interpretation

- This optimization targets snapshot edge selection complexity on camera updates and preserves active-section/edge visibility behavior.
- The baseline fixture is edge-light, so this run mostly reflects scene-level variance; meaningful wins are expected in edge-dense projects where snapshot edge scans were previously O(total edges).
