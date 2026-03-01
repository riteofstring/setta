# Canvas Engine Incremental Edge Adjacency Map Sync

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `7ec9f7f10`
Related reports:

- `perf/reports/frontend/2026-03-04_visible-id-rank-sort-optimization.md`
- `perf/reports/frontend/2026-03-04_incremental-edge-index-sync-optimization.md`

## Goal

Eliminate full adjacency-map rebuilds in `applyDataEdges` and `applyAgenticEdges` by updating section-edge adjacency incrementally.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`

Key adjustments:

- Added per-edge section endpoint maps for data edges and agentic edges.
- Updated edge apply paths to:
  - mutate section adjacency only when endpoints change
  - remove adjacency entries only for removed edges
  - avoid allocating/replacing whole `edgeIdsBySectionId` maps each apply
- Added helper removal paths for section adjacency cleanup.
- Added a regression test that moves data/agentic edge endpoints from near to far sections and verifies visible-edge culling updates correctly.

## Verification Commands

- `pnpm -C frontend exec prettier --write src/canvas-engine/sceneAdapter.ts src/canvas-engine/sceneAdapter.test.ts`
- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts` (300-section case currently blocked by backend 500 in fixture creation)
- `chrome-devtools-mcp` page validation on `http://127.0.0.1:3005/lark_chasing` with `useCanvasEngineV1=true`

## Metrics (legacy large-canvas scenario)

Before (previous slice run):

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

After (this run):

### 100-section scenario

- `topLevelNodeCount=69`
- `canvasDomNodeCount=4532`
- `totalDomNodeCount=5162`
- `avgFrameMs=8.33`
- `p95FrameMs=9.70`
- `p99FrameMs=10.20`
- `maxFrameMs=10.20`

### 300-section scenario

- Not completed: fixture generation failed with backend HTTP 500 during `/createTopLevelSection`.
- Backend log signature:
  - `ValueError: Code section <id> missing codeFileBinding`
  - `response_status_code=500` on `/api/createTopLevelSection`
- Reproduced across multiple reruns in:
  - `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-e2e-logs-setta.frontend-performance-5-20260304-143646/backend.log`

## Interpretation

- This change reduces apply-time work for edge updates by avoiding whole-map adjacency reconstruction.
- Behavior parity is covered by existing host E2E plus the new endpoint-move adjacency regression test.
- A full 300-section perf comparison for this slice is currently blocked by a backend fixture-creation issue unrelated to scene-adapter logic.
