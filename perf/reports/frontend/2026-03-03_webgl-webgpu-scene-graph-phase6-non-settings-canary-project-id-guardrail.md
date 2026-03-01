# WebGL/WebGPU Scene-Graph Phase 6 Non-Settings Canary Project-Id Guardrail

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 338dec496 (+ local Phase 6 canary guardrail report)
Related PR: n/a

## Goal

Validate the first non-settings controlled default-on canary path:
- use explicit `projectConfigId` allowlist targeting (`setta.sceneGraphRenderer.rolloutProjectConfigIds`),
- confirm allowlisted non-settings config defaults to renderer enabled when `setta.sceneGraphRenderer.enabled` is unset,
- confirm explicit `setta.sceneGraphRenderer.enabled=0` still hard-disables renderer on the same config.

## Code Paths Covered

- `frontend/src/sceneGraphRenderer/flags.ts`
- `frontend/src/sceneGraphRenderer/rollout.ts`
- `frontend/src/sceneGraphRenderer/useSceneGraphRendererRuntime.ts`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3000/chief_quick` (isolated non-settings config)
- Canary target config id: `0e05f0d6-0f24-4eaa-823c-87431b226172`
- Browser/OS: Chrome via `chrome-devtools-mcp` on macOS
- Flags under test:
  - default-on canary: `enabled` unset + `rolloutProjectConfigIds=[targetId]`
  - kill-switch: `enabled=0` + same `rolloutProjectConfigIds`

## Before (Kill Switch)

Measurement method:
- CDP trace with explicit kill switch set on the canary config.

Key metrics:
- LCP: `2440 ms`
- CLS: `0.02`
- Runtime labels:
  - `enabled=0`
  - `backendRequested=auto`
  - `backendResolved=dom`
  - `resolutionReason=renderer_disabled`
  - `probeStatus=ready`
- Surface counters:
  - `sceneCompatibleCount=0`
  - `domIslandCount=0`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-kill-switch.trace.json`
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-kill-switch.png`

## After (Canary Default-On)

Measurement method:
- CDP trace with `enabled` unset and canary id allowlisted.

Key metrics:
- LCP: `2104 ms`
- CLS: `0.02`
- Runtime labels:
  - `enabled=1`
  - `backendRequested=auto`
  - `backendResolved=webgpu`
  - `resolutionReason=auto_webgpu_selected`
  - `probeStatus=ready`
- Surface counters:
  - `sceneCompatibleCount=1`
  - `domIslandCount=0`

Artifacts:
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-default-on.trace.json`
- `perf/artifacts/frontend/2026-03-03_non-settings-canary_phase6-default-on.png`

## Conclusion

- What improved:
  - non-settings rollout can now be enabled deterministically per `projectConfigId` without broad project-name expansion.
  - explicit enabled kill switch remains authoritative and still forces DOM path.
- Regressions observed:
  - none in targeted automated coverage.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer src/state/actions/websocketReceive.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
