# Phase 14 Agent-Run And Run-Chain App Middleware Regression Hardening

## Purpose

This doc narrows the next bounded Phase 14 follow-on to app-level route
hardening for the landed agent-run and run-chain runtime surface.

The managed-agent and run-chain route/runtime slices are already complete at the
service and `internal/httpapi` layers. What remains thin is proving those route
semantics through the real app handler stack:

- managed agent routes stay intentionally unavailable in production IDE wiring
  until a real executor exists
- run-chain routes remain available through that same app wiring

This is a regression-hardening slice, not a new agentic runtime feature slice.

## Current Status

Completed before this slice:

- Phase 12 bounded external-agent runtime and transport ownership
- Phase 13 non-runtime agentic transport ownership
- Phase 14 managed `start/stopAgentRun` ownership
- Phase 14 managed and external-agent `start/stopRunChain` ownership
- Phase 14 caller/progress closeout and executor-fixture stabilization

Current Go coverage before this slice:

- `internal/httpapi/agent_run_routes_test.go` covers:
  - managed `start/stopAgentRun`
  - managed and external-agent `start/stopRunChain`
  - route-level unavailable/not-found/validation mapping
- `internal/app/app_test.go` only proves the app wiring shape:
  - managed run service exists
  - managed runtime is disabled before an executor is wired
  - run-chain runtime stays available through the external-agent boundary

What is still missing explicitly:

- app-level `503 managed_agent_run_unavailable` mapping through the real
  handler stack
- app-level `startRunChain` success through the real handler stack
- app-level persisted run readback and stop behavior for that run-chain path

## Scope

This slice covers:

- focused app-handler tests in `internal/app/app_test.go`
- real authenticated HTTP coverage for:
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
  - `POST /startRunChain`
  - `POST /stopRunChain`
  - `GET /getAgentRuns`
  - `POST /getAgentRun`
- doc updates so the app-middleware hardening is discoverable later

## Non-Goals

- changing the managed runtime disabled behavior in real app wiring
- adding a fake provider executor just for app tests
- changing run-chain transport or persisted run shape
- reopening richer run-chain progress or realtime work

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-14-managed-agent-start-stop-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-managed-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-external-agent-child-step-runtime.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-caller-and-progress-closeout.md`
- `backend/setta/routers/agentic.py`
- `tests/routers/test_agentic_routes.py`
- `internal/httpapi/agent_run_routes.go`
- `internal/httpapi/agent_run_routes_test.go`
- `internal/app/app.go`
- `internal/app/app_test.go`

## Working Decisions

- keep the real app semantics honest:
  - managed agent routes should keep returning `503` in IDE mode until a real
    executor is wired
  - tests should prove that behavior instead of trying to bypass it
- use a run-chain shape that does not depend on a managed executor
  - empty-step run chains are sufficient to prove availability, persistence,
    and route wiring through the real app handler stack
- keep transport thin and runtime behavior unchanged

## Implementation Notes

1. Add app-level managed-route unavailable regressions.
   - `POST /startAgentRun`
   - `POST /stopAgentRun`
   should both return the documented `503` through the real app handler stack

2. Add app-level run-chain route regressions.
   - start an empty run chain
   - wait for terminal persisted state through the app-owned runtime
   - read the run back through `GET /getAgentRuns` and `POST /getAgentRun`
   - stop the completed run and verify the unchanged terminal state

3. Keep acceptance narrow.
   - `./scripts/go.sh test ./internal/app -run 'AgentRun|RunChain' -count=1`
   - `./scripts/go.sh test ./internal/httpapi -run 'AgentRun|RunChain' -count=1`

## Progress Notes

- 2026-03-09: opened this focused Phase 14 app-level hardening slice after the
  terminal hardening track closed and the remaining concrete regression gap was
  app-middleware coverage for the landed agent-run/run-chain route surface.

## Next Recommended Step

- if this slice lands cleanly, treat the current-scope Phase 14 route surface
  as covered at runtime, route, and app-handler levels
- only reopen this area for a concrete new caller or feature request
