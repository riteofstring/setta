# Canvas Engine Data-Edge Anchor Estimation

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `f2020888c`
Related reports:

- `perf/reports/frontend/2026-03-04_container-wrapper-allocation-optimization.md`
- `perf/reports/frontend/2026-03-04_canvas-engine-rewrite-baseline.md`

## Goal

Reduce dependency on DOM-measured handle coordinates by estimating data-edge anchors from section geometry and deterministic port ordering when handle measurements are unavailable.

## Changes

Files changed:

- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/components/Pages/Project/CanvasEngineHost.tsx`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`

Key adjustments:

- Added `sectionEdgePortsBySectionId` to scene adapter input.
- Derived per-section input/output edge-port catalogs from section impl metadata in `CanvasEngineHost`.
- Updated data-edge record creation to:
  - prefer measured handle positions when present
  - estimate missing source/target anchors from section rect + port index slotting when missing
- Added unit coverage for:
  - fully estimated data-edge anchors
  - hybrid measured+estimated anchor resolution

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

## Metrics (legacy large-canvas scenario)

Before (from previous slice report):

### 100-section scenario

- `topLevelNodeCount=67`
- `canvasDomNodeCount=4366`
- `totalDomNodeCount=4982`
- `avgFrameMs=9.53`
- `p95FrameMs=9.30`
- `p99FrameMs=9.40`
- `maxFrameMs=215.70`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12708`
- `totalDomNodeCount=14034`
- `avgFrameMs=63.62`
- `p95FrameMs=541.60`
- `p99FrameMs=941.90`
- `maxFrameMs=942.30`

After (this run):

### 100-section scenario

- `topLevelNodeCount=70`
- `canvasDomNodeCount=4531`
- `totalDomNodeCount=5162`
- `avgFrameMs=8.34`
- `p95FrameMs=10.00`
- `p99FrameMs=10.30`
- `maxFrameMs=10.40`

### 300-section scenario

- `topLevelNodeCount=201`
- `canvasDomNodeCount=12747`
- `totalDomNodeCount=14077`
- `avgFrameMs=56.14`
- `p95FrameMs=500.00`
- `p99FrameMs=949.20`
- `maxFrameMs=991.70`

## Interpretation

- This slice targets correctness and work-distribution (estimated anchors without DOM handle reads), not structural DOM reduction.
- Timing remains noisy across large-canvas runs, but the scenario remains stable and behavior parity holds in the host E2E suite.
- New deterministic fallback avoids null-anchor data edges when handle measurements are temporarily unavailable.
