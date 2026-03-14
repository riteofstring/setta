# Phase 14 Managed-Agent Start/Stop Runtime And Transport

## Purpose

This doc scopes the first executable follow-on under the broader Phase 14
runtime-mutation plan.

The goal is to land Go-owned managed `POST /startAgentRun` and
`POST /stopAgentRun` without reopening run-chain work or reintroducing
Python's hybrid external-agent dispatch through `startAgentRun`.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and transport ownership for the bounded
  external-agent surface
- Phase 13 non-runtime agentic transport ownership
- Phase 14 broad runtime-mutation planning in
  `phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`

Current Go state after this slice:

- `internal/agentruns`
  - now includes a managed active-run runtime owner over the existing
    completion-oriented service
  - now shares managed run start, completion, and cancellation persistence
    through the existing `Service` source-of-truth instead of duplicating that
    logic in transport
- `internal/httpapi/agent_run_routes.go`
  - now owns:
    - `GET /getAgentRuns`
    - `POST /getAgentRun`
    - `POST /startAgentRun`
    - `POST /stopAgentRun`
- `internal/app.App`
  - now wires the managed runtime in IDE mode
  - still leaves that runtime disabled in real app behavior until a provider
    executor is wired

Current Python behavior relevant to this slice:

- `POST /startAgentRun`
  - loads the profile
  - resolves the engine config
  - dispatches to either managed or external-agent execution
- `POST /stopAgentRun`
  - only stops the managed runner
  - cancels active work and persists cancelled terminal state

## Scope

This slice delivered:

- explicit Go managed active-run runtime above `internal/agentruns.Service`
- thin Go transport for:
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
- focused route/runtime tests for:
  - successful managed start
  - successful managed stop
  - disabled-runtime mapping
  - missing profile/run handling
  - explicit rejection of external-agent-backed profiles
  - share-mode gating

## Non-Goals

- `POST /startRunChain`
- `POST /stopRunChain`
- reintroducing external-agent execution through `POST /startAgentRun`
- websocket AI-follow parity for managed runs
- full managed chat-route parity with Python `AgentRunner`
- provider-backed executor wiring in the real IDE app

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/llm/agent_runner.py`
- `tests/routers/test_agentic_routes.py`
- `tests/llm/test_agent_runner.py`
- `internal/agentruns/service.go`
- `internal/agentruns/service_test.go`
- `internal/httpapi/agent_run_routes.go`
- `internal/httpapi/agent_run_routes_test.go`
- `internal/app/app.go`
- `internal/app/app_test.go`

## Implementation Notes

1. `internal/agentruns.Service` now splits its managed execution flow into
   package-local prepare, execute, and cancel helpers.
   - the new runtime reuses that source-of-truth for persisted `run_started`,
     `snapshot`, `run_completed`, `run_failed`, and `run_cancelled` behavior

2. `internal/agentruns.Runtime` now owns:
   - active run registry
   - per-run cancellation contexts
   - async completion cleanup
   - wait-for-run test support

3. `POST /startAgentRun` is now managed-only in Go.
   - the route loads the profile from the landed Go profile store
   - profiles whose engine resolves to `EngineType.external_agent` now fail
     explicitly instead of tunneling through the external-agent runtime

4. `POST /stopAgentRun` now delegates only to the managed runtime.
   - active runs are cancelled immediately
   - persisted running runs also transition to cancelled deterministically
   - completed/failed/cancelled runs are returned unchanged

5. Real app wiring stays honest.
   - IDE app assembly now constructs the managed runtime
   - start/stop still return `503` in production wiring until a real executor
     exists, which matches the current disabled managed-run service state

## Verification

- `./scripts/go.sh test ./internal/agentruns ./internal/httpapi -run 'AgentRun|Runtime|Service' -count=1`
- `./scripts/go.sh test ./internal/app -run 'ManagedAgentRun|AgentRun' -count=1`

## Decisions Made

- keep managed `start/stopAgentRun` Go-owned and managed-only
- reject external-agent-backed profiles on this route instead of preserving the
  Python hybrid dispatch path
- wire the managed runtime in the real IDE app now, even though it remains
  disabled without a provider executor
- keep run-chain entirely out of scope for this slice

## Open Questions

- whether a future provider-backed executor should land here or in a later
  bounded follow-on; current recommendation is later
- whether run-chain still has a real caller after this managed start/stop
  landing, or whether it should remain deferred indefinitely

## Progress Notes

- 2026-03-09: opened the first focused executable Phase 14 slice for managed
  `start/stopAgentRun` over the landed managed-run service foundations.
- 2026-03-09: landed `internal/agentruns.Runtime` as the first Go-owned
  managed active-run owner above the completion-oriented service.
- 2026-03-09: landed thin Go transport for `POST /startAgentRun` and
  `POST /stopAgentRun` with focused route coverage and explicit
  external-agent-engine rejection.

## Next Recommended Step

- treat managed `start/stopAgentRun` as complete for the current bounded scope
- the later explicit runtime decision reopened run-chain and that follow-on is
  now landed in `phase-14-run-chain-managed-runtime-and-transport.md`
