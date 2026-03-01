# WebGL/WebGPU Scene-Graph Phase 5 Chart Scene-Compatibility Expansion

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 4541c406e (+ local Phase 5 chart coverage changes)
Related PR: n/a

## Goal

Implement the next Phase 5 coverage step:
- move `Chart` from forced DOM to scene-compatible in the explicit compatibility matrix,
- keep unsupported types (for example `Chat`) forced DOM,
- verify deterministic compatibility counters for mixed-type project states.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/sectionCompatibility.ts`
- `frontend/src/sceneGraphRenderer/sectionCompatibility.test.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3084/settings` (`All Settings` tab)
- Flags:
  - `enabled=1`
  - `backend=webgl`
  - `domIslandRadius=0`
  - `debugOverlay=0`
- Dataset: built-in `settings` project, plus automated insertion of `Chart`/`Chat` sections in Playwright checks
- Browser/OS: Chrome via `chrome-devtools-mcp` on macOS

## Before

Measurement method:
- CDP trace + scripted wheel-pan/wheel-zoom loop on `settings -> All Settings`

Key metrics (pre-change):
- Scene layer sections: `42`
- DOM island count: `0`
- Compatibility counters:
  - scene-compatible: `42`
  - dom-only: `0`
  - unresolved: `0`
  - forced-dom: `0`
- Snapshot pipeline mode: `worker`
- Snapshot total build/diff time (latest sample): `0 ms`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-chart-coverage-before.trace.json`
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-chart-coverage-before.png`

## After

Measurement method:
- same CDP trace scenario + same scripted pan/zoom loop

Key metrics (post-change):
- Scene layer sections: `42`
- DOM island count: `0`
- Compatibility counters:
  - scene-compatible: `42`
  - dom-only: `0`
  - unresolved: `0`
  - forced-dom: `0`
- Snapshot pipeline mode: `worker`
- Snapshot total build/diff time (latest sample): `0.1 ms`

Functional compatibility checks (Playwright):
- Inserting an unsupported `Chat` section increases forced-DOM counters and keeps the section DOM-mounted.
- Inserting a `Chart` section keeps `dom-only`/`forced-dom` unchanged and increases `scene-compatible` by at least `1`.

Artifacts:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-chart-coverage-after.trace.json`
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-chart-coverage-after.png`

## Conclusion

- What improved:
  - `Chart` sections are now explicitly scene-compatible in the Phase 5 matrix.
  - Compatibility behavior remains deterministic and is verified under mixed supported/unsupported section insertion.
- Regressions observed:
  - No regressions in targeted Vitest or Playwright coverage.
  - No material perf regression in the baseline `settings` surface; default dataset counters are unchanged.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/sectionCompatibility.test.ts src/sceneGraphRenderer/domIslands.test.ts src/sceneGraphRenderer/snapshotPipeline.test.ts src/sceneGraphRenderer/backends/CanvasSceneBackendBase.test.ts src/sceneGraphRenderer/snapshot.test.ts src/sceneGraphRenderer/backendFactory.test.ts src/sceneGraphRenderer/capabilities.test.ts src/sceneGraphRenderer/flags.test.ts src/sceneGraphRenderer/runtime.test.ts src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
