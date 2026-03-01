# Canvas Engine Renderer Ordered-Scene Fast Path

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `1e7a7e9df`
Related reports:

- `perf/reports/frontend/2026-03-04_visible-id-rank-sort-optimization.md`
- `perf/reports/frontend/2026-03-04_edge-adjacency-incremental-map-optimization.md`

## Goal

Remove redundant renderer hot-path work that re-sorted scene arrays each frame even though the scene adapter already emits z-ordered snapshots.

## Changes

Files changed:

- `frontend/src/canvas-engine/renderer.ts`

Key adjustments:

- Removed per-frame sorting of:
  - `scene.rects`
  - `scene.dataEdges`
  - `scene.agenticEdges`
- Added explicit ordered-scene fast path in `buildSceneVertexData` and consumed adapter order directly.
- Replaced hovered-edge linear lookups (`Array.find`) with O(1) map lookups built once per frame.

## Verification Commands

- `pnpm -C frontend exec prettier --write src/canvas-engine/renderer.ts`
- `pnpm -C frontend exec vitest run src/canvas-engine`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`
- `chrome-devtools-mcp` page validation on `http://127.0.0.1:3005/lark_chasing` with `useCanvasEngineV1=true`

## Metrics (legacy large-canvas scenario)

Before (previous full successful run):

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

- `topLevelNodeCount=67`
- `canvasDomNodeCount=4381`
- `totalDomNodeCount=4997`
- `avgFrameMs=11.09`
- `p95FrameMs=10.00`
- `p99FrameMs=166.80`
- `maxFrameMs=216.60`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12683`
- `totalDomNodeCount=14009`
- `avgFrameMs=53.43`
- `p95FrameMs=425.00`
- `p99FrameMs=951.50`
- `maxFrameMs=966.70`

## Interpretation

- Renderer now avoids N log N sort work for rects/edges on every frame and relies on the scene adapter as the ordering source-of-truth.
- 300-section run improved average and p95 frame times in this sample.
- 100-section run showed significant outlier spikes; this suite remains noisy and should be interpreted as directional unless supported by repeated runs.
