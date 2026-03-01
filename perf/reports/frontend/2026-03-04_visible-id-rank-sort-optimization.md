# Canvas Engine Visible-ID Rank Sort Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `2d9ff418f`
Related reports:

- `perf/reports/frontend/2026-03-04_snapshot-order-cache-optimization.md`
- `perf/reports/frontend/2026-03-04_incremental-edge-index-sync-optimization.md`

## Goal

Avoid scanning all cached ordered section/edge IDs on every snapshot by sorting only visible IDs using cached order ranks.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`

Key adjustments:

- Added cached rank maps for section IDs, data-edge IDs, and agentic-edge IDs.
- Rebuilt rank maps only when ordering is invalidated (add/remove/z-index changes).
- Updated snapshot generation to:
  - collect visible section/edge ID sets
  - sort those visible IDs using rank maps
  - fetch records in sorted order
- Kept deterministic fallback ordering for IDs missing from rank maps.

## Verification Commands

- `pnpm -C frontend exec prettier --write src/canvas-engine/sceneAdapter.ts`
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

After (this run):

### 100-section scenario

- `topLevelNodeCount=69`
- `canvasDomNodeCount=4531`
- `totalDomNodeCount=5161`
- `avgFrameMs=8.34`
- `p95FrameMs=9.90`
- `p99FrameMs=10.20`
- `maxFrameMs=10.30`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12761`
- `totalDomNodeCount=14091`
- `avgFrameMs=59.04`
- `p95FrameMs=508.30`
- `p99FrameMs=933.30`
- `maxFrameMs=949.20`

## Interpretation

- This removes full ordered-list scans from snapshot builds and shifts work to visible-set sorting with numeric rank lookups.
- In this baseline run, 300-section frame averages and upper tail improved modestly while 100-section metrics stayed effectively flat.
- Expected benefit grows as total section/edge counts increase while the visible interaction window remains a smaller subset of the scene.
