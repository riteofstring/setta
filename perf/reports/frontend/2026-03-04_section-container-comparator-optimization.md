# Section Container Comparator Optimization

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / `b559d9d97`
Related baseline: `perf/reports/frontend/2026-03-04_canvas-engine-rewrite-baseline.md`

## Goal

Reduce render/update overhead in section container wrappers by replacing deep `lodash` equality checks with targeted shallow comparators in hot React memo and store-selector paths.

## Scope

Changed files:
- `frontend/src/components/Section/Container/SectionContainer.tsx`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Section/Container/ContainerCore.tsx`
- `frontend/src/components/Section/Container/ContainerWrappers.tsx`

Main changes:
- Replaced `_.isEqual` selectors with `zustand/shallow` where selector outputs are scalar/flat.
- Replaced broad deep React memo comparators with explicit shallow object-value comparators for drag listener/style maps.
- Kept behavior parity checks through existing canvas-engine and legacy large-canvas suites.

## Measurement Method

- Legacy large-canvas perf spec:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/large-canvas-baseline.perf.spec.ts`
- Engine parity regression suite:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts`

## Results

### Legacy 100-section scenario
- `topLevelNodeCount=69`
- `canvasDomNodeCount=4532`
- `totalDomNodeCount=5162`
- `avgFrameMs=8.20`
- `p95FrameMs=9.80`
- `p99FrameMs=10.80`
- `maxFrameMs=11.10`

### Legacy 300-section scenario
- `topLevelNodeCount=202`
- `canvasDomNodeCount=12846`
- `totalDomNodeCount=14180`
- `avgFrameMs=53.98`
- `p95FrameMs=499.10`
- `p99FrameMs=965.90`
- `maxFrameMs=1010.50`

### Canvas-engine parity suite
- `18 passed` (`canvas-engine-host.spec.ts`)

## Interpretation

- Large-canvas results are directionally better on average and p95 in the 300-section scenario versus baseline, while p99/max remain noisy.
- This change is primarily CPU-overhead reduction in comparison/equality paths; it does not change DOM topology, so DOM counts remain in the same range.
- Behavior parity was preserved across the full canvas-engine interaction suite and legacy large-canvas perf tests.
