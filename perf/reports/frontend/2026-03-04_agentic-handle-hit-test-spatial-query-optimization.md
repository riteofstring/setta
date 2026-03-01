# Canvas Engine Agentic-Handle Hit-Test Spatial Query Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `fc332f7bd`
Related reports:

- `perf/reports/frontend/2026-03-04_snapshot-edge-adjacency-optimization.md`
- `perf/reports/frontend/2026-03-04_data-handle-hit-test-spatial-query-optimization.md`

## Goal

Reduce pointer-move work during agentic edge connect flows by avoiding full section scans in agentic-handle hit testing.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`

Key adjustments:

- Reworked `hitTestAgenticHandleAtWorldPoint` to query candidate sections from the section spatial index rather than iterating every rect.
- Added query margin constant (`AGENTIC_HANDLE_EXTENT_WORLD`) to account for handles rendered outside section bounds.
- Preserved existing hit prioritization semantics (z-index, distance, source-target tie-break).

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

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

## Interpretation

- This slice narrows agentic-handle hit-test search scope to nearby sections and keeps interaction behavior unchanged.
- Baseline timings remain noisy; benefit is expected in dense scenes with many section rects where agentic-connection pointer moves previously paid O(total sections) scans.
