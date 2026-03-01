# WebGL/WebGPU Scene-Graph Phase 6 Settings Project Default-On Expansion

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ a0f2329f8 (+ local Phase 6 guardrail report)
Related PR: n/a

## Goal

Validate the next controlled default-on rollout step:
- expand rollout from `settings -> All Settings` only to the full `settings` project class,
- keep explicit `setta.sceneGraphRenderer.enabled` override as the top-priority kill switch,
- capture guardrail traces for default-on vs kill-switch behavior on the same settings surface.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/rollout.ts`
- `frontend/src/sceneGraphRenderer/rollout.test.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3000/settings`
- Browser/OS: Chrome via `chrome-devtools-mcp` on macOS
- Surface checks:
  - `All Settings` tab
  - `Core` tab
- Flags under test:
  - default-on path: remove all `setta.sceneGraphRenderer.*` keys from localStorage
  - kill-switch path: `setta.sceneGraphRenderer.enabled=0`

## Before (Kill Switch)

Measurement method:
- CDP trace with explicit kill switch (`enabled=0`), reload-driven capture.

Key metrics:
- LCP: `5679 ms`
- CLS: `0.02`
- Runtime labels (`All Settings` + `Core`):
  - `enabled=0`
  - `backendRequested=auto`
  - `backendResolved=dom`
  - `resolutionReason=renderer_disabled`
  - `probeStatus=ready`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase6-settings-project-kill-switch.trace.json`
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase6-settings-project-kill-switch.png`

## After (Default-On Expansion)

Measurement method:
- CDP trace with no explicit `enabled` key (rollout default applies), reload-driven capture.

Key metrics:
- LCP: `1338 ms`
- CLS: `0.02`
- Runtime labels (`All Settings` + `Core`):
  - `enabled=1`
  - `backendRequested=auto`
  - `backendResolved=webgpu`
  - `resolutionReason=auto_webgpu_selected`
  - `probeStatus=ready`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase6-settings-project-default-on.trace.json`
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase6-settings-project-default-on.png`

## Conclusion

- What improved:
  - rollout now enables the scene renderer across settings tabs (`All Settings` and `Core`) without requiring an explicit localStorage flag.
  - kill-switch precedence remains intact and deterministically forces DOM backend.
- Regressions observed:
  - none in targeted Vitest/Playwright coverage.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
