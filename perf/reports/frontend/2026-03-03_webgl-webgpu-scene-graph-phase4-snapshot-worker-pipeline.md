# WebGL/WebGPU Scene-Graph Phase 4 Snapshot Diff + Worker Pipeline

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 06e184810 (+ local Phase 4 working changes)
Related PR: n/a

## Goal

Implement Phase 4 scene-graph infrastructure:
- run snapshot build + diff through a worker pipeline when available,
- keep deterministic main-thread fallback,
- enforce bounded section/edge resource caches with deterministic eviction,
- expose deterministic instrumentation for snapshot/update costs and cache pressure.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/snapshotPipeline.ts`
- `frontend/src/sceneGraphRenderer/snapshotWorker.ts`
- `frontend/src/sceneGraphRenderer/snapshotPipeline.test.ts`
- `frontend/src/sceneGraphRenderer/SceneGraphRendererLayer.tsx`
- `frontend/src/sceneGraphRenderer/backends/CanvasSceneBackendBase.ts`
- `frontend/src/sceneGraphRenderer/backends/CanvasSceneBackendBase.test.ts`
- `frontend/src/sceneGraphRenderer/backends/RendererBackend.ts`
- `frontend/src/sceneGraphRenderer/backends/DomBackendAdapter.ts`
- `frontend/src/sceneGraphRenderer/types.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3084/settings` (`All Settings` tab)
- Flags:
  - `enabled=1`
  - `backend=webgl`
  - `domIslandRadius=2`
  - `debugOverlay=0`
- Dataset: built-in `settings` project, `All Settings` view
- Browser/OS: Chrome via `chrome-devtools-mcp` on macOS

## Before

Measurement method:
- CDP Performance trace + scripted wheel-pan/wheel-zoom loop
- Baseline run forces `main-thread` pipeline mode by disabling `Worker` through pre-navigation init script

Key metrics (main-thread fallback baseline):
- Snapshot pipeline mode: `main-thread`
- Pan `p50 FPS`: `125.00`
- Zoom `p50 FPS`: `125.79`
- Snapshot build/diff/total: `0 / 0 / 0 ms`
- `updateResources`: `0 ms`
- Pending/stale build responses: `0 / 0`
- Cache stats:
  - section: `42 / 2048`
  - edge: `0 / 4096`
  - total evictions: `0`
  - buffer pressure: `0.0205`

Trace artifact:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase4-main-thread-baseline.trace.json`

## After

Measurement method:
- CDP Performance trace + identical scripted wheel-pan/wheel-zoom loop
- Worker path enabled (default runtime support)

Key metrics (worker pipeline):
- Snapshot pipeline mode: `worker`
- Pan `p50 FPS`: `123.46`
- Zoom `p50 FPS`: `121.95`
- Snapshot build/diff/total: `0.1 / 0 / 0.1 ms`
- `updateResources`: `0 ms`
- Pending/stale build responses: `0 / 0`
- Cache stats:
  - section: `42 / 2048`
  - edge: `0 / 4096`
  - total evictions: `0`
  - buffer pressure: `0.0205`

Trace artifact:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase4-worker-after.trace.json`

Visual artifact:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase4-worker-visual.png`

## Conclusion

- What improved:
  - Worker-mode snapshot+diff pipeline is active and instrumented.
  - Bounded cache capacity/pressure/eviction telemetry is now available on the scene layer.
  - Main-thread fallback remains deterministic and testable.
- Regressions observed:
  - No functional regressions in targeted tests.
  - FPS delta between fallback and worker runs in this scenario is small and within run-to-run variance; snapshot costs are already very low on this dataset.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/snapshotPipeline.test.ts src/sceneGraphRenderer/backends/CanvasSceneBackendBase.test.ts src/sceneGraphRenderer/snapshot.test.ts src/sceneGraphRenderer/backendFactory.test.ts src/sceneGraphRenderer/capabilities.test.ts src/sceneGraphRenderer/domIslands.test.ts src/sceneGraphRenderer/flags.test.ts src/sceneGraphRenderer/runtime.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
