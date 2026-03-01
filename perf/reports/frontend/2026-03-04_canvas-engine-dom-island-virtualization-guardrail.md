# Canvas Engine DOM-Island Virtualization Guardrail

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `57f5fdfed`
Related baseline: `perf/reports/frontend/2026-03-04_canvas-engine-rewrite-baseline.md`

## Goal

Add an automated large-canvas guardrail on the canvas-engine path that enforces bounded DOM-island mounting behavior at scale (300 sections) and verifies retention cleanup does not leak hidden islands.

## Scenario

- Test: `frontend/tests/e2e/sections/canvas-engine-dom-island-virtualization.perf.spec.ts`
- Command:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-dom-island-virtualization.perf.spec.ts`
- Engine mode:
  - `useCanvasEngineV1=true`
- Dataset:
  - 300 top-level sections in deterministic grid placement

## Metrics (captured from test output)

- retention:
  - `retentionCap=96`
  - `retentionMs=280`
- initial metrics:
  - `rectCount=301`
  - `mountedDomIslands=10`
  - `retainedDomIslands=0`
  - `visibleDomIslands=10`
  - `hiddenDomIslands=0`
  - `canvasDomNodeCount=678`
  - `totalDomNodeCount=1842`
- post-pan metrics:
  - `rectCount=301`
  - `mountedDomIslands=10`
  - `retainedDomIslands=0`
  - `visibleDomIslands=10`
  - `hiddenDomIslands=0`
  - `canvasDomNodeCount=678`
  - `totalDomNodeCount=1842`
- post-retention-window metrics:
  - `rectCount=301`
  - `mountedDomIslands=10`
  - `retainedDomIslands=0`
  - `visibleDomIslands=10`
  - `hiddenDomIslands=0`
  - `canvasDomNodeCount=678`
  - `totalDomNodeCount=1842`

## Guardrails Added

- Added new Playwright perf test:
  - `frontend/tests/e2e/sections/canvas-engine-dom-island-virtualization.perf.spec.ts`
- Assertions:
  - section rect materialization at 300-scale
  - mounted/visible island counts remain bounded well below total section count
  - retained-island count stays within cap and drains to zero after retention window
  - hidden retained-island DOM does not persist after retention window

## Notes

- This guardrail uses structural performance indicators (DOM/island counts), avoiding fragile timing thresholds.
- In this run, mounted islands remained low and stable (`10`) across checkpoints, indicating virtualization was active and bounded under the stress fixture.
