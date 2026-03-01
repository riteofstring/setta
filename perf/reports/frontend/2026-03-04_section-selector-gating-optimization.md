# Section Selector Gating Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `988a2e27e`
Related reports:
- `perf/reports/frontend/2026-03-04_canvas-engine-rewrite-baseline.md`
- `perf/reports/frontend/2026-03-04_section-container-comparator-optimization.md`

## Goal

Reduce per-section selector work by avoiding expensive lookups unless the section type requires them.

## Changes

- `SectionContainer`:
  - Only resolves embedded terminal state for code-section types.
  - Only resolves Python codegen target metadata for GenPython-related types.
- `SectionContainerCoreResizabe`:
  - Only resolves embedded terminal state for code-section types.

## Verification Commands

- `pnpm -C frontend exec vitest run src/canvas-engine/domIslandMountPolicy.test.ts src/canvas-engine/sceneAdapter.test.ts src/canvas-engine/spatialIndex.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`

## Metrics (legacy large-canvas run after change)

### 100-section scenario
- `topLevelNodeCount=70`
- `canvasDomNodeCount=4532`
- `totalDomNodeCount=5163`
- `avgFrameMs=8.33`
- `p95FrameMs=9.30`
- `p99FrameMs=9.40`
- `maxFrameMs=9.40`

### 300-section scenario
- `topLevelNodeCount=202`
- `canvasDomNodeCount=12824`
- `totalDomNodeCount=14158`
- `avgFrameMs=59.88`
- `p95FrameMs=541.60`
- `p99FrameMs=1032.80`
- `maxFrameMs=1045.90`

## Interpretation

- Selector gating reduces wasted work in non-code/non-GenPython sections and keeps behavior parity intact.
- Large-canvas timing remains noisy run-to-run; this slice focuses on deterministic reduction of unnecessary selector computation rather than structural DOM changes.
