# Container Wrapper Allocation Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `a030db836`
Related reports:
- `perf/reports/frontend/2026-03-04_canvas-engine-rewrite-baseline.md`
- `perf/reports/frontend/2026-03-04_section-selector-gating-optimization.md`

## Goal

Reduce hot-path object allocation churn and preserve stable references in section DnD wrappers.

## Changes

File changed:
- `frontend/src/components/Section/Container/ContainerWrappers.tsx`

Key adjustments:
- Reused shared empty drag-listener object instead of creating `{}` per render.
- Reused constant opacity style maps (`0.3`, `0.5`, `0.85`) instead of creating new objects.
- Memoized merged style output and returned original `style` reference when no opacity override is needed.

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/domIslandMountPolicy.test.ts src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/spatialIndex.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

## Metrics (legacy large-canvas run after change)

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

## Interpretation

- This is an allocation/reference-stability optimization; timing metrics remain noisy run-to-run, but DOM counts in this run remained slightly below baseline reference.
- Canvas-engine parity behavior remained intact (`18 passed` on `canvas-engine-host.spec.ts`).
