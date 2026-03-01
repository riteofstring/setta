# WebGL/WebGPU Scene-Graph Phase 1 Viewport DOM Residency

Date: 2026-03-04
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 9d8aebb2e (+ local Phase 1 viewport residency changes)
Related PR: n/a

## Goal

Enforce strict viewport DOM residency so visible sections stay DOM-mounted in scene mode, eliminating empty-rectangle regressions while retaining interaction performance gains where possible.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/domIslands.ts`
- `frontend/src/sceneGraphRenderer/domIslands.test.ts`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## What Changed

- Added deterministic viewport anchor computation (`computeViewportDomAnchorSectionIds`) from camera transform + viewport bounds + margin.
- Fed viewport anchors into DOM-island BFS seeding, alongside active/focused section anchors.
- Added transform quantization for viewport-residency recomputation to avoid per-pixel churn.
- Exposed runtime residency telemetry: `data-scene-graph-renderer-viewport-dom-anchor-count`.
- Replaced the old scene-only promotion E2E with a strict viewport-residency parity check.

## Measurement Method

- Benchmarks:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/scene-graph-benchmark-suite.spec.ts`
- Parity E2E:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
- Unit tests:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/domIslands.test.ts`
- CDP trace pair (same settings flow, scripted wheel pan/zoom stream):
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase1-viewport-residency-dom.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase1-viewport-residency-auto.trace.json`

## Playwright Benchmark Results

### Settings -> All Settings

- `dom` (`resolvedBackend=dom`):
  - snapshot: `domNodeCount=9716`, `reactFlowNodeCount=42`
  - pan: `frameTimeP50=24.0ms`, `fpsP50=41.667`, `droppedFrames=58`
  - zoom: `frameTimeP50=8.3ms`, `fpsP50=120.482`, `zoomDelta=0.519`
- `auto` (`resolvedBackend=webgl`):
  - snapshot: `domNodeCount=9716`, `reactFlowNodeCount=42`, `sceneCompatibleSectionCount=42`
  - pan: `frameTimeP50=8.8ms`, `fpsP50=112.36`, `droppedFrames=26`
  - zoom: `frameTimeP50=7.9ms`, `fpsP50=126.582`, `zoomDelta=0.199`

### Synthetic Mixed Sections

- `dom` (`resolvedBackend=dom`):
  - snapshot: `domNodeCount=4715`, `reactFlowNodeCount=65`
  - pan: `frameTimeP50=8.3ms`, `fpsP50=120.482`
  - zoom: `frameTimeP50=8.3ms`, `fpsP50=120.482`
- `auto` (`resolvedBackend=webgl`):
  - snapshot: `domNodeCount=4715`, `reactFlowNodeCount=65`, `sceneCompatibleSectionCount=57`, `domOnlySectionCount=8`
  - pan: `frameTimeP50=8.3ms`, `fpsP50=120.482`
  - zoom: `frameTimeP50=8.3ms`, `fpsP50=120.482`

## CDP Metadata Pair (Settings, fit view)

- `dom`:
  - `resolvedBackend=dom`
  - `domIslandCount=0`
  - `viewportDomAnchorCount=0`
  - `reactFlowNodeCount=42`
  - `reactFlowDomNodeCount=8628`
- `auto`:
  - `resolvedBackend=webgpu`
  - `domIslandCount=42`
  - `viewportDomAnchorCount=42`
  - `reactFlowNodeCount=42`
  - `reactFlowDomNodeCount=8628`

Artifacts:
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase1-viewport-residency-dom.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase1-viewport-residency-dom.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase1-viewport-residency-auto.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase1-viewport-residency-auto.trace.json`

## Conclusion

- Viewport-residency parity objective is met in this phase: visible sections remain DOM-mounted, and scene-only click-target metadata remains empty for visible content.
- In fit-view stress framing, DOM structural reduction is no longer present (`auto` and `dom` mount the same section set), as intended by strict parity-first residency.
- Even without DOM-count reduction in that framing, settings pan performance in this benchmark run remains materially better in `auto` than `dom`.
- Next optimization work should focus on reducing offscreen DOM residency and hydration churn while preserving this parity guarantee.

## Automated Verification

- `pnpm -C frontend gcf`
- `pnpm -C frontend exec vitest run src/sceneGraphRenderer/domIslands.test.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/scene-graph-benchmark-suite.spec.ts`
