# WebGL/WebGPU Scene-Graph Phase 0 Baseline

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 03c5a2400
Related PR: n/a

## Goal

Establish a deterministic baseline for `Settings -> All Settings` and capture runtime backend/capability labels before scene-graph renderer substrate work begins.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/flags.ts`
- `frontend/src/sceneGraphRenderer/capabilities.ts`
- `frontend/src/sceneGraphRenderer/runtime.ts`
- `frontend/src/sceneGraphRenderer/useSceneGraphRendererRuntime.ts`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/tests/e2e/helpers.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3000/settings` (`All Settings` tab)
- Steps to reproduce (deterministic):
  1. Open `Settings`.
  2. Select `All Settings`.
  3. Run scripted wheel-pan loop (60 events), then scripted pinch-zoom loop (60 events).
- Data set / project used: built-in `settings` project, `All Settings` view.
- Browser + OS: Chrome (via chrome-devtools-mcp) on macOS.
- Notes (extensions, throttling, dev/prod build, etc): local dev build via `pnpm -C frontend start`; CPU/network throttling disabled.

## Before (baseline)

- Measurement method (DevTools panels used, settings):
  - CDP Performance trace (`performance_start_trace` / `performance_stop_trace`) over scripted pan/zoom window.
  - In-page deterministic frame-sampling script for pan/zoom FPS + start/stop hitch metrics.
  - Runtime backend labels from `window.__settaSceneGraphRendererPerf` and `data-scene-graph-renderer-*` attributes.
- Key metrics:
  - `nodeCount`: `42`
  - Pan `p50 FPS`: `46.30`
  - Zoom `p50 FPS`: `119.05`
  - Pan start hitch: `5.2ms`
  - Pan stop/settle hitch: `19.0ms`
  - Zoom start hitch: `26.4ms`
  - Zoom stop/settle hitch: `25.0ms`
  - Trace summary (`NO_NAVIGATION`): `CLS 0.00`
  - Default flags labels: `enabled=0`, `requested=auto`, `resolved=dom`, `reason=renderer_disabled`
  - Capability labels: `probeStatus=ready`, `webgpuAvailable=1`, `webgl2Available=1`, `softwareFallback=0`
  - Flag-on plumbing sanity check labels: `enabled=1`, `requested=auto`, `resolved=webgpu`, `reason=auto_webgpu_selected`
- Observations:
  - Phase 0 capability probing reports both WebGPU and WebGL2 as available in this environment.
  - Default rollout state remains DOM-backed (`enabled=0`), preserving current rendering behavior while exposing backend labels for harnessing.

## After

Phase 0 baseline capture only. No scene-graph rendering substrate (Phase 1+) is enabled yet.

## Conclusion

- What improved:
  - Baseline metrics/traces are now captured for the target benchmark surface.
  - Backend/capability labels are now available to Playwright/CDP harness flows.
- What regressed (if any) + why it is acceptable:
  - None observed in this baseline capture.
- Follow-ups:
  - Re-run the same scripted trace once Phase 1 static shell rendering lands.
  - Add backend-segmented perf trend rows (`dom`, `webgpu`, `webgl`) as each backend becomes runnable.

## Raw Artifacts (local-only)

- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase0-baseline.trace.json`

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
- Vitest test(s) / bench(es):
  - `frontend/src/sceneGraphRenderer/flags.test.ts`
  - `frontend/src/sceneGraphRenderer/capabilities.test.ts`
  - `frontend/src/sceneGraphRenderer/runtime.test.ts`
- Budgets/assertions added:
  - Renderer perf label availability and backend-resolution validity assertions on `Settings -> All Settings`.
