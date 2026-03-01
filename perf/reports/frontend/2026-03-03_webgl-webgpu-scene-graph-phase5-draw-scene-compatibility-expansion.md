# WebGL/WebGPU Scene-Graph Phase 5 Draw Scene-Compatibility Expansion

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 8774906e3 (+ local Phase 5 draw coverage changes)
Related PR: n/a

## Goal

Implement the next Phase 5 coverage step:
- move `Draw` from forced DOM to scene-compatible in the explicit matrix,
- preserve forced-DOM behavior for unsupported section types,
- extend mixed-type compatibility checks to validate `Chart`, `Spreadsheet`, `TaskBoard`, `Browser`, `Image`, `Social`, and `Draw` as scene-compatible.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/sectionCompatibility.ts`
- `frontend/src/sceneGraphRenderer/sectionCompatibility.test.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3000/settings` (`All Settings` tab)
- Flags:
  - `enabled=1`
  - `backend=webgl`
  - `domIslandRadius=0`
  - `debugOverlay=0`
- Dataset: built-in `settings` project, plus automated insertion of `Chat`, `Chart`, `Spreadsheet`, `TaskBoard`, `Browser`, `Image`, `Social`, and `Draw` sections in Playwright checks
- Browser/OS: Chrome via `chrome-devtools-mcp` on macOS

## Before

Measurement method:
- CDP trace on `settings -> All Settings`

Key metrics (pre-change baseline from prior step):
- Scene layer sections: `42`
- DOM island count: `0`
- Compatibility counters:
  - scene-compatible: `42`
  - dom-only: `0`
  - forced-dom: `0`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-social-coverage-after.trace.json`
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-social-coverage-after.png`

## After

Measurement method:
- same CDP trace scenario

Key metrics (post-change):
- LCP: `1272 ms`
- CLS: `0.02`
- Scene layer sections: `42`
- DOM island count: `0`
- Compatibility counters:
  - scene-compatible: `42`
  - dom-only: `0`
  - unresolved: `0`
  - forced-dom: `0`
- Scene layer backend/visibility:
  - backend: `webgl`
  - visible: `1`

Functional compatibility checks (Playwright):
- Inserting unsupported `Chat` still increases forced-DOM counters and keeps the section DOM-mounted.
- Inserting `Chart`, `Spreadsheet`, `TaskBoard`, `Browser`, `Image`, `Social`, and `Draw` sections increases scene-compatible count by at least `7` while `dom-only` and `forced-dom` counters remain unchanged.

Artifacts:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-draw-coverage-after.trace.json`
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase5-draw-coverage-after.png`

## Conclusion

- What improved:
  - `Draw` is now explicitly scene-compatible in the Phase 5 matrix.
  - Mixed supported/unsupported type handling remains deterministic under automated checks.
- Regressions observed:
  - No regressions in targeted Vitest or Playwright coverage.
  - No material perf regression in the baseline settings surface.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
