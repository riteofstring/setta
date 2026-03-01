# Canvas Engine Data-Handle Hit-Test Spatial Query Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `3d6d4899f`
Related reports:

- `perf/reports/frontend/2026-03-04_connected-data-handle-selector-optimization.md`
- `perf/reports/frontend/2026-03-04_data-edge-anchor-estimation.md`

## Goal

Reduce pointer-move hit-test work for data edge connect/reconnect by querying only nearby sections through the scene spatial index instead of scanning the full edge-handle registry.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`

Key adjustments:

- Reworked `hitTestDataHandleAtWorldPoint` to:
  - query candidate sections using `CanvasEngineSpatialIndex` in a local world-space window
  - evaluate only source/target ports belonging to candidate sections
  - prefer measured handle positions when present
  - fall back to deterministic estimated anchors from section rect + port ordering
- Added internal per-section measured data-handle index during `applyEdgeHandlePositions` to avoid scanning the full handle map while preserving measured-handle parity paths.
- Added section-query margin (`DATA_HANDLE_EXTENT_WORLD`) so handles that sit just outside section bounds remain hittable.

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
- `p95FrameMs=10.00`
- `p99FrameMs=10.30`
- `maxFrameMs=10.30`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12761`
- `totalDomNodeCount=14091`
- `avgFrameMs=61.15`
- `p95FrameMs=524.80`
- `p99FrameMs=983.30`
- `maxFrameMs=999.70`

After (this run):

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

## Interpretation

- This slice specifically reduces hit-test search scope for connect/reconnect pointer paths; broad scene timing remains noisy in legacy baseline stress runs.
- Canvas host interaction parity remained intact across full host E2E coverage after the spatial-query rewrite.
