# WebGL/WebGPU Scene-Graph Phase 6 small_shell Default-On Expansion

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ b3923a26a (+ local small_shell default-on rollout expansion)
Related PR: n/a

## Goal

Promote `small_shell` from name-canary to default-on rollout:
- add `small_shell` to default project-name rollout targets,
- keep explicit `setta.sceneGraphRenderer.enabled` override as top-priority kill switch,
- keep project-name canary coverage on a non-default isolated project name.

## Code Paths Covered

- `frontend/src/sceneGraphRenderer/rollout.ts`
- `frontend/src/sceneGraphRenderer/rollout.test.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3000/small_shell`
- Browser/OS: Chrome on macOS (existing trace artifacts + fresh Playwright guardrails)
- Flags under test:
  - default-on path: `enabled` unset, no canary allowlist required
  - kill-switch path: `enabled=0` on the same `small_shell` surface

## Before (Kill Switch)

Measurement method:
- fresh Playwright guardrail assertions on `small_shell` kill-switch behavior.
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
- existing same-surface `small_shell` default-on trace artifact.
- fresh Playwright assertions for rollout reason and backend negotiation path.

Key metrics:
- LCP: `2239 ms`
- CLS: `0.015177330002188683`
- Runtime labels (Playwright-asserted):
  - `enabled=1`
  - `rolloutDefaultOn=1`
  - `rolloutDefaultOnReason=project_config_name_default`
  - `hasEnabledStorageOverride=0`
  - `backendRequested=auto`
  - `backendResolved in {webgpu, webgl, dom}` (auto negotiation path)

Artifacts:
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-name-allowlist-default-on.trace.json`

## Tooling Notes

- `chrome-devtools-mcp` remains unavailable in this workspace (`Transport closed`), so this increment combines existing trace artifacts with fresh automated rollout/kill-switch assertions.

## Conclusion

- What improved:
  - `small_shell` no longer requires canary-name flags; it is default-on by rollout policy.
  - explicit `enabled=0` still overrides rollout defaults and forces DOM backend.
  - name-canary behavior remains covered using a deterministic non-default isolated project name.
- Regressions observed:
  - none in targeted automated coverage.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
