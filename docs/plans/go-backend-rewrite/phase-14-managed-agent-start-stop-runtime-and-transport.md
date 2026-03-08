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

Current Go state before this slice:

- `internal/agentruns.Service`
  - owns managed run context building, persisted lifecycle events, and
    completion-oriented execution through an injected executor
  - does not yet expose an active runtime owner or cancellation registry
- `internal/httpapi/agent_run_routes.go`
  - owns only `GET /getAgentRuns` and `POST /getAgentRun`
- `internal/app.App`
  - wires a managed run service in IDE mode
  - currently leaves that service disabled until a real executor is wired

Current Python behavior relevant to this slice:

- `POST /startAgentRun`
  - loads the profile
  - resolves the engine config
  - dispatches to either managed or external-agent execution
- `POST /stopAgentRun`
  - only stops the managed runner
  - cancels active work and persists cancelled terminal state

## Scope

This slice should cover:

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

- `docs/plans/go-backend-rewrite/phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
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

## Recommended Design

1. Add a bounded managed active-run runtime in `internal/agentruns`.
   - keep it above the completion-oriented `Service`
   - own:
     - active run registry
     - cancellation handles
     - asynchronous completion cleanup

2. Refactor the managed service only enough to support that runtime.
   - keep context building, lifecycle persistence, and executor invocation
     source-of-truth in `Service`
   - avoid duplicating system-prompt, engine-resolution, or persistence logic
     inside route handlers or runtime glue

3. Keep `startAgentRun` managed-only in Go.
   - load the profile in transport or a thin owner above transport
   - reject profiles whose engine resolves to `EngineType.external_agent`
   - do not preserve Python's hybrid dispatch behavior

4. Keep transport thin in `internal/httpapi/agent_run_routes.go`.
   - strict JSON decode
   - explicit required-field validation
   - clear status mapping for:
     - missing profile
     - missing run
     - disabled managed runtime
     - unsupported engine type

5. Keep the real app honest.
   - wire the managed runtime in IDE mode even before a real executor exists
   - return `503` from start/stop when managed execution is still disabled in
     production wiring

## Verification Targets

- `./scripts/go.sh test ./internal/agentruns -run 'Runtime|Service' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'AgentRun|StartAgentRun|StopAgentRun' -count=1`
- `./scripts/go.sh test ./internal/app -run 'AgentRun|ManagedAgentRun' -count=1`

## Open Questions

- whether the managed runtime should eventually expose wait/shutdown helpers for
  future app lifecycle integration; current recommendation is yes for tests and
  bounded cleanup, but not to broaden this slice into full app shutdown
  orchestration
- whether a future provider-backed executor should land here or in a later
  bounded follow-on; current recommendation is later

## Progress Notes

- 2026-03-09: opened the first focused executable Phase 14 slice for managed
  `start/stopAgentRun` over the landed managed-run service foundations.

## Next Recommended Step

- land the bounded managed runtime owner plus thin `start/stopAgentRun`
  transport
- keep run-chain deferred until this slice is complete
