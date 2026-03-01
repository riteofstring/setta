# WebGL/WebGPU Scene-Graph Phase 6 Non-Settings Canary Project-Name Guardrail

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 2f9e3f553 (+ local Phase 6 project-name guardrail report)
Related PR: n/a

## Goal

Validate controlled default-on rollout for non-settings projects via explicit `projectConfigName` canary targeting:
- use `setta.sceneGraphRenderer.rolloutProjectConfigNames` as the deterministic rollout source of truth,
- confirm allowlisted non-settings config defaults to renderer enabled when `setta.sceneGraphRenderer.enabled` is unset,
- confirm explicit `setta.sceneGraphRenderer.enabled=0` remains a hard kill switch on the same canary path.

## Code Paths Covered

- `frontend/src/sceneGraphRenderer/flags.ts`
- `frontend/src/sceneGraphRenderer/rollout.ts`
- `frontend/src/sceneGraphRenderer/useSceneGraphRendererRuntime.ts`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3000/small_shell` (isolated non-settings config)
- Canary target config name: `small_shell`
- Browser/OS: Chrome on macOS (trace artifacts + Playwright guardrails)
- Flags under test:
  - default-on canary: `enabled` unset + `rolloutProjectConfigNames=["small_shell"]`
  - kill-switch: `enabled=0` + same `rolloutProjectConfigNames` value

## Before (Kill Switch)

Measurement method:
- kill-switch metrics reference existing non-settings canary baseline trace and are paired with the project-name kill-switch Playwright assertion path.

Key metrics:
- LCP: `2440 ms`
- CLS: `0.015177330002188683`
- Runtime labels (Playwright-asserted for project-name canary kill-switch):
  - `enabled=0`
  - `rolloutDefaultOn=1`
  - `rolloutDefaultOnReason=project_config_name_canary`
  - `hasEnabledStorageOverride=1`
  - `backendResolved=dom`
  - `resolutionReason=renderer_disabled`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-kill-switch.trace.json`
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-kill-switch.png`

## After (Project-Name Canary Default-On)

Measurement method:
- extracted CWV values from `UkmPageLoadTimingUpdate` events in the recorded project-name canary trace.

Key metrics:
- LCP: `2239 ms`
- CLS: `0.015177330002188683`
- Runtime labels (Playwright-asserted for project-name canary default-on):
  - `enabled=1`
  - `rolloutDefaultOn=1`
  - `rolloutDefaultOnReason=project_config_name_canary`
  - `hasEnabledStorageOverride=0`
  - `backendRequested=auto`
  - `backendResolved in {webgpu, webgl, dom}` (auto negotiation path)

Artifacts:
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-name-allowlist-default-on.trace.json`

## Tooling Notes

- `chrome-devtools-mcp` remains unavailable in this workspace (`Transport closed`), so this report uses recorded trace artifacts plus automated Playwright guardrails rather than a fresh CDP capture run.

## Conclusion

- What improved:
  - non-settings rollout can now be controlled deterministically by `projectConfigName` canary targeting.
  - explicit `enabled=0` still overrides rollout defaults and forces DOM backend.
- Regressions observed:
  - none in targeted automated coverage.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
