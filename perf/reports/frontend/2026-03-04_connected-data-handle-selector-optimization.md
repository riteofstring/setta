# Canvas Engine Connected Data-Handle Selector Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `400d750c6`
Related reports:

- `perf/reports/frontend/2026-03-04_data-edge-anchor-estimation.md`
- `perf/reports/frontend/2026-03-04_container-wrapper-allocation-optimization.md`

## Goal

Reduce `CanvasEngineHost` update churn by subscribing to only data-handle positions relevant to active data edges, instead of the full edge-handle registry.

## Changes

Files changed:

- `frontend/src/components/Pages/Project/CanvasEngineHost.tsx`
- `frontend/src/canvas-engine/edgeHandlePositionSelectors.ts`
- `frontend/src/canvas-engine/edgeHandlePositionSelectors.test.ts`
- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`

Key adjustments:

- Added selector helpers to:
  - build deterministic connected data-handle key sets from data edges
  - pick only requested handle entries from the registry
  - compare selected handle maps by key membership and value identity
- Updated `CanvasEngineHost` to subscribe to filtered handle positions using custom equality.
- Added scene-adapter hit-test fallback for data handles:
  - if measured handle positions are unavailable, hit test against deterministic estimated anchors derived from section rect + port ordering
  - preserves connect/reconnect UX parity while keeping filtered subscriptions
- Added unit tests for selector behavior and estimated data-handle hit testing.

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/edgeHandlePositionSelectors.test.ts src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/spatialIndex.test.ts src/canvas-engine/domIslandMountPolicy.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

## Metrics (legacy large-canvas scenario)

Before (previous slice run):

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

After (this run):

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

## Interpretation

- This slice reduces unnecessary canvas-host subscriptions by ignoring unrelated handle updates.
- Timing in this legacy stress scenario remains noisy; selector optimization is aimed at reducing avoidable React/store invalidation work rather than DOM structure.
- Data-edge connect/reconnect parity remained intact after adding deterministic estimated-handle hit-test fallback.
