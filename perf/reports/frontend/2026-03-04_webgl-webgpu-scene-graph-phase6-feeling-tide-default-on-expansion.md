# WebGL/WebGPU Scene-Graph Phase 6 feeling_tide Default-On Expansion

Date: 2026-03-04
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ a5f30fdf1 (+ local feeling_tide default-on rollout expansion)
Related PR: n/a

## Goal

Promote `feeling_tide` from name-canary eligibility to default-on rollout:
- add `feeling_tide` to default project-name rollout targets,
- keep explicit `setta.sceneGraphRenderer.enabled` override as top-priority kill switch,
- retain deterministic canary coverage for non-default project names.

## Code Paths Covered

- `frontend/src/sceneGraphRenderer/rollout.ts`
- `frontend/src/sceneGraphRenderer/rollout.test.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3000/feeling_tide`
- Browser/OS: Chrome on macOS (fresh Playwright guardrails)
- Flags under test:
  - default-on path: `enabled` unset, no canary allowlist required
  - kill-switch path: `enabled=0` on the same `feeling_tide` surface

## Before (Kill Switch)

Measurement method:
- fresh Playwright guardrail assertions on `feeling_tide` kill-switch behavior.
- same-surface CDP trace capture is currently blocked (`chrome-devtools-mcp` transport closed).

Key runtime labels (Playwright-asserted):
- `enabled=0`
- `rolloutDefaultOn=1`
- `rolloutDefaultOnReason=project_config_name_default`
- `hasEnabledStorageOverride=1`
- `backendResolved=dom`
- `resolutionReason=renderer_disabled`

Trace artifacts:
- unavailable for same-surface kill-switch run in this increment (CDP outage).

## After (Default-On Expansion)

Measurement method:
- fresh Playwright assertions for rollout reason and backend negotiation path on `feeling_tide`.
- same-surface CDP trace capture is currently blocked (`chrome-devtools-mcp` transport closed).

Key runtime labels (Playwright-asserted):
- `enabled=1`
- `rolloutDefaultOn=1`
- `rolloutDefaultOnReason=project_config_name_default`
- `hasEnabledStorageOverride=0`
- `backendRequested=auto`
- `backendResolved in {webgpu, webgl, dom}` (auto negotiation path)

Trace artifacts:
- unavailable for same-surface default-on run in this increment (CDP outage).

## Tooling Notes

- `chrome-devtools-mcp` remains unavailable in this workspace (`Transport closed`), so this increment relies on fresh automated rollout/kill-switch assertions and defers same-surface trace capture.

## Conclusion

- What improved:
  - `feeling_tide` no longer requires canary-name flags; it is default-on by rollout policy.
  - explicit `enabled=0` still overrides rollout defaults and forces DOM backend.
  - existing name-canary tests continue to validate non-default isolated project names.
- Regressions observed:
  - none in targeted automated coverage.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/rollout.test.ts src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
