# Canvas Engine Scene Adapter (Milestone 2) Post-Refactor Report

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-5 / working tree after `1b9c20561`
Related baseline: `perf/reports/frontend/2026-03-04_canvas-engine-rewrite-baseline.md`

## Goal

Validate post-change behavior for the new canvas-engine scene adapter path:
- incremental patching for top-level section geometry + edge records
- viewport-culling via spatial index
- reduced canvas-path DOM footprint while preserving current UX constraints on default path (flag remains off by default)

## Scope Caveat

This run measures the **engine-flag path** (`useCanvasEngineV1=true`) with shell-level GPU rect rendering. It is not full parity with legacy ReactFlow internals yet.

## Scenario

- URL: `http://127.0.0.1:3005/hearing_coast` with backend override persisted to `http://127.0.0.1:8005`
- Data set:
  - 300 top-level sections seeded on one project (Callable/TextBlock mix)
  - no data/agentic edges in this run
- Interaction workload:
  - synthetic pan + zoom loop over 220 frames on `CanvasEngineHost` canvas
- Browser:
  - Chrome DevTools MCP, no CPU/network throttling

## Before Reference (legacy baseline)

From the baseline report (300 mixed sections, ReactFlow path):
- `canvasDomNodeCount`: 12,748
- `totalDomNodeCount`: 14,078
- frame timings: `avgFrameMs=60.33`, `p95=515.80`, `p99=950.10`, `max=966.70`
- CDP `DOMSize`: ~14,402 elements
- CDP `ForcedReflow`: ~610ms total

## After (this run, engine path)

- Host/backend state:
  - `activeBackend=webgpu`
  - `totalRectCount=300`
  - `visibleRectCount=4` (post-interaction camera position)
- DOM counts:
  - `canvasDomNodeCount`: 1 (canvas subtree)
  - `totalDomNodeCount`: 321
- Frame metrics (220-frame scripted interaction):
  - `avgFrameMs`: 8.376
  - `p95FrameMs`: 9.700
  - `p99FrameMs`: 10.100
  - `maxFrameMs`: 17.900
  - `minFrameMs`: 6.700

## Automated Guardrails Added

- `frontend/src/canvas-engine/sceneAdapter.test.ts`
  - incremental patch correctness
  - active-offscreen retention behavior
  - large-scene structural guardrail (`2000` sections, single change -> `sectionsUpdated=1`)
- `frontend/src/canvas-engine/spatialIndex.test.ts`
  - query, move-update, and removal correctness for grid index

## Interpretation

- The new adapter path drastically reduces DOM participation on the canvas path and keeps frame pacing stable under this shell-render workload.
- This is expected at Milestone 2 because full DOM section internals are not mounted in the engine path yet.
- Remaining parity/perf work will be validated in later milestones when interaction and DOM-island behavior are implemented.
