# WebGL/WebGPU Scene-Graph Phase 6 chief_quick Default-On Expansion

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 60c6fefc7 (+ local chief_quick default-on rollout expansion)
Related PR: n/a

## Goal

Promote a validated non-settings surface from canary to default-on:
- move `chief_quick` into default-on rollout (`projectConfigName` default set),
- keep explicit `setta.sceneGraphRenderer.enabled` override as top-priority kill switch,
- retain canary pathways for non-default names.

## Code Paths Covered

- `frontend/src/sceneGraphRenderer/rollout.ts`
- `frontend/src/sceneGraphRenderer/rollout.test.ts`
- `frontend/tests/e2e/helpers.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3000/chief_quick`
- Browser/OS: Chrome on macOS (existing trace artifacts + Playwright guardrails)
- Flags under test:
  - default-on path: `enabled` unset, no canary allowlist required
  - kill-switch path: `enabled=0` on the same `chief_quick` surface

## Before (Kill Switch)

Measurement method:
- reference chief_quick kill-switch trace.

Key metrics:
- LCP: `2440 ms`
- CLS: `0.015177330002188683`
- Runtime labels (Playwright-asserted on chief_quick kill-switch path):
  - `enabled=0`
  - `rolloutDefaultOn=1`
  - `rolloutDefaultOnReason=project_config_name_default`
  - `hasEnabledStorageOverride=1`
  - `backendResolved=dom`
  - `resolutionReason=renderer_disabled`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-kill-switch.trace.json`
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-kill-switch.png`

## After (Default-On Expansion)

Measurement method:
- reference chief_quick default-on trace for renderer-path perf (same surface).
- verify rollout reason transition to `project_config_name_default` via new Playwright guardrail.

Key metrics:
- LCP: `2105 ms`
- CLS: `0.015177330002188683`
- Runtime labels (Playwright-asserted on chief_quick default-on path):
  - `enabled=1`
  - `rolloutDefaultOn=1`
  - `rolloutDefaultOnReason=project_config_name_default`
  - `hasEnabledStorageOverride=0`
  - `backendRequested=auto`
  - `backendResolved in {webgpu, webgl, dom}` (auto negotiation path)

Artifacts:
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-default-on.trace.json`
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-default-on.png`

## Tooling Notes

- `chrome-devtools-mcp` is currently unavailable in this workspace (`Transport closed`), so this increment reuses existing chief_quick traces and relies on fresh Playwright assertions for rollout reason and kill-switch precedence.

## Conclusion

- What improved:
  - `chief_quick` no longer requires canary flags; it is default-on by project class rollout policy.
  - explicit `enabled=0` remains authoritative and still forces DOM backend.
- Regressions observed:
  - none in targeted automated coverage.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
