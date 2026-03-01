# WebGL/WebGPU Scene-Graph Phase 5 Section Compatibility Gating

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ df33a86da (+ local Phase 5 working changes)
Related PR: n/a

## Goal

Implement the first Phase 5 compatibility step:
- add an explicit section-type compatibility matrix,
- force unsupported/unresolved section types to stay DOM-mounted,
- expose compatibility counters for deterministic verification.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/sectionCompatibility.ts`
- `frontend/src/sceneGraphRenderer/sectionCompatibility.test.ts`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
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
- CDP trace + scripted wheel-pan/wheel-zoom loop (Phase 4 worker run baseline, same route/flags)

Key metrics (Phase 4 worker baseline):
- Pan `p50 FPS`: `123.46`
- Zoom `p50 FPS`: `121.95`
- Scene layer sections: `42`
- DOM island count: `0`
- Snapshot pipeline mode: `worker`

Baseline artifact:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase4-worker-after.trace.json`

## After

Measurement method:
- CDP trace + same scripted wheel-pan/wheel-zoom loop

Key metrics (Phase 5):
- Pan `p50 FPS`: `120.48`
- Zoom `p50 FPS`: `120.48`
- Scene layer sections: `42`
- DOM island count: `0`
- Compatibility counters:
  - scene-compatible: `42`
  - dom-only: `0`
  - unresolved: `0`
  - forced-dom: `0`
- Snapshot pipeline mode: `worker`
- Snapshot total build/diff time (latest sample): `0.2 ms`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-compatibility-after.trace.json`
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-compatibility-visual.png`

## Conclusion

- What improved:
  - Compatibility gating is explicit and deterministic by section type.
  - Unsupported/unresolved sections now have a source-of-truth forced-DOM path.
  - Runtime counters for compatibility decisions are exposed for tests and profiling.
- Regressions observed:
  - No functional regressions in targeted tests.
  - FPS moved slightly versus prior run and remains in the same range; no material interaction regression observed.
- Notes:
  - In this `settings` benchmark surface, all sections resolve as scene-compatible, so forced-DOM gating is not active in the measured trace.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/sectionCompatibility.test.ts src/sceneGraphRenderer/domIslands.test.ts src/sceneGraphRenderer/snapshotPipeline.test.ts src/sceneGraphRenderer/backends/CanvasSceneBackendBase.test.ts src/sceneGraphRenderer/snapshot.test.ts src/sceneGraphRenderer/backendFactory.test.ts src/sceneGraphRenderer/capabilities.test.ts src/sceneGraphRenderer/flags.test.ts src/sceneGraphRenderer/runtime.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
