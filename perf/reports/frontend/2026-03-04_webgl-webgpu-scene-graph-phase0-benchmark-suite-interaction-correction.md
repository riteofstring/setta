# WebGL/WebGPU Scene-Graph Phase 0 Benchmark Suite Interaction Correction

Date: 2026-03-04
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 4af7bff13 (+ local benchmark harness correction)
Related PR: n/a

## Goal

Correct phase-0 benchmark methodology so it measures interaction rendering behavior instead of backend request latency.

## Code Paths Touched

- `frontend/tests/e2e/settings/scene-graph-benchmark-suite.spec.ts`

## What Changed

- Replaced `/setViewport` request-latency sweep metrics with interaction metrics collected from in-page `requestAnimationFrame` samples.
- Added per-mode readiness guardrails before measurement:
  - `Settings -> All Settings` now requires a populated section count floor.
  - non-DOM backends require scene-layer snapshot readiness before capture.
- Added zoom-headroom normalization to avoid max-zoom carryover between mode runs.
- Kept fallback zoom path (`zoom in` controls) when synthetic wheel zoom does not produce transform changes.

## Measurement Method

- Playwright benchmark suite:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/scene-graph-benchmark-suite.spec.ts`
- Interaction sequence:
  - wheel-pan stream,
  - wheel-zoom stream (activation key path),
  - fallback to repeated zoom-in control clicks when needed.
- Metrics captured per interaction:
  - frame-time p50/p95,
  - FPS p50/p95,
  - dropped/long frame counts,
  - start/stop hitch,
  - viewport transform delta.

## Playwright Results (adapter-unavailable environment)

### Settings -> All Settings

- `dom` (`resolvedBackend=dom`):
  - `domNodeCount=9716`, `reactFlowNodeCount=42`
  - pan: `frameTimeP50=24.8ms`, `fpsP50=40.323`, `droppedFrames=61`
  - zoom (fallback controls): `frameTimeP50=8.3ms`, `fpsP50=120.482`, `zoomDelta=0.519`
- `auto` (`resolvedBackend=webgl`, `webgpuReason=adapter_unavailable`):
  - `domNodeCount=477`, `reactFlowNodeCount=0`, `sceneCompatibleSectionCount=42`
  - pan: `frameTimeP50=8.3ms`, `fpsP50=120.482`, `droppedFrames=0`
  - zoom (fallback controls): `frameTimeP50=8.2ms`, `fpsP50=121.951`, `zoomDelta=0.199`

### Synthetic Mixed Sections

- `dom` (`resolvedBackend=dom`):
  - `domNodeCount=4715`, `reactFlowNodeCount=65`
  - pan: `frameTimeP50=8.3ms`, `fpsP50=120.482`
  - zoom (fallback controls): `frameTimeP50=8.3ms`, `fpsP50=120.482`, `zoomDelta=0.598`
- `auto` (`resolvedBackend=webgl`):
  - `domNodeCount=1136`, `reactFlowNodeCount=8`, `sceneCompatibleSectionCount=57`, `domOnlySectionCount=8`
  - pan: `frameTimeP50=8.3ms`, `fpsP50=120.482`
  - zoom (fallback controls): `frameTimeP50=8.3ms`, `fpsP50=120.482`, `zoomDelta=0.598`

## CDP Trace Pair (same settings flow)

Environment note: CDP run resolved `auto` to `webgpu` (`auto_webgpu_selected`) on this machine/profile, unlike Playwright's isolated run (`adapter_unavailable`).

- DOM mode metadata:
  - `resolvedBackend=dom`, `reactFlowNodeCount=42`, `reactFlowDomNodeCount=8628`
- AUTO mode metadata:
  - `resolvedBackend=webgpu`, `reactFlowNodeCount=0`, `reactFlowDomNodeCount=16`

Artifacts:
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase0-benchmark-correction-dom.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase0-benchmark-correction-dom.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase0-benchmark-correction-auto.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_phase0-benchmark-correction-auto.png`

## Conclusion

- The benchmark now measures frame behavior during real interaction streams instead of request round-trip time.
- In the Playwright environment, `auto -> webgl` shows clear pan-frame improvement over `dom` on `Settings -> All Settings` while preserving content.
- Zoom is still measured via fallback controls in this environment; wheel-zoom parity under automation remains a follow-up item.

## Automated Verification

- `pnpm -C frontend gcf`
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/scene-graph-benchmark-suite.spec.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
- `pnpm -C frontend exec vitest run src/sceneGraphRenderer/rollout.test.ts src/sceneGraphRenderer/runtime.test.ts src/sceneGraphRenderer/capabilities.test.ts src/sceneGraphRenderer/flags.test.ts src/sceneGraphRenderer/sectionCompatibility.test.ts src/sceneGraphRenderer/snapshotPipeline.test.ts`
