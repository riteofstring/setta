# Phase 14 Run-Chain Managed Runtime And Transport

## Purpose

This doc scopes the first executable run-chain follow-on under the broader
Phase 14 runtime-mutation plan.

The goal is to land Go-owned `POST /startRunChain` and `POST /stopRunChain`
for managed `setta_llm` child steps only, without widening scope into
external-agent child-run orchestration.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and transport ownership for the bounded
  external-agent surface
- Phase 13 non-runtime agentic transport ownership
- Phase 14 managed `POST /startAgentRun` and `POST /stopAgentRun` ownership in
  `phase-14-managed-agent-start-stop-runtime-and-transport.md`

Current Go state before this slice:

- `internal/agentruns`
  - owns persisted run storage, managed executor preparation/execution, and an
    active managed runtime with cancellation
- `internal/httpapi/agent_run_routes.go`
  - owns:
    - `GET /getAgentRuns`
    - `POST /getAgentRun`
    - `POST /startAgentRun`
    - `POST /stopAgentRun`
- no Go-owned run-chain runtime exists yet

Current Python behavior relevant to this slice:

- `POST /startRunChain`
  - creates and persists a parent chain run immediately
  - records `chain_started` plus a `snapshot` event
  - spawns a background task that runs each step in order
  - writes `step_started`, `step_completed` / `step_failed`,
    `chain_completed` / `chain_failed` / `chain_cancelled`
  - can fan out child steps to either managed or external-agent execution
- `POST /stopRunChain`
  - cancels the active chain task
  - stops the currently running child step
  - persists cancelled terminal state on the parent run

## Scope

This slice will deliver:

- a dedicated Go run-chain runtime owner with:
  - parent chain run persistence
  - active chain task registry
  - active child-step tracking for managed steps
  - deterministic stop/cancellation behavior
- thin Go transport for:
  - `POST /startRunChain`
  - `POST /stopRunChain`
- focused tests for:
  - empty chain completion
  - managed step completion
  - chain stop while a managed child step is running
  - invalid step input validation
  - explicit rejection of external-agent-backed child steps
  - IDE/share mode transport behavior

## Non-Goals

- external-agent child-step execution inside run-chain
- recreating Python's hybrid managed/external step fan-out in Go
- websocket AI-follow or chain-progress streaming parity
- bundling provider-backed managed executor work into this slice
- changing the generated request/response shape for run-chain routes

## Inputs

- `docs/plans/go-backend-rewrite/phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
- `docs/plans/go-backend-rewrite/phase-14-managed-agent-start-stop-runtime-and-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/run_chain.py`
- `tests/agentic/test_run_chain.py`
- `internal/agentruns/runtime.go`
- `internal/agentruns/service.go`
- `internal/agentruns/store.go`
- `internal/agentprofiles/store.go`
- `internal/httpapi/agent_run_routes.go`

## Design

1. Add a dedicated `internal/runchains` owner instead of burying orchestration
   inside `internal/agentruns`.
   - the parent chain run is its own runtime concern
   - child managed-step execution composes through the landed
     `agentruns.Runtime`

2. Keep the first slice managed-only.
   - step engine configs whose resolved `engineType` is
     `EngineType.external_agent` fail explicitly
   - this avoids inventing a lower-level external-agent step-run entrypoint in
     the same slice

3. Preserve only the product semantics that matter for persisted runs.
   - parent run `inputs` carry:
     - `runType = "run_chain"`
     - `chainId`
     - `chainName`
     - `chainSpec`
     - caller-provided `inputs`
   - child-step `inputs` carry:
     - inherited `projectConfigId`, `chatId`, `sectionId`, `thinking`
     - `chainId`, `chainName`
     - `runType = "run_chain_step"`
     - `chainRunId`, `parentRunId`, `stepId`, `stepIndex`
     - `engineConfigId`
     - optional `agentProfileId`
     - optional `previousOutputs`
     - optional `prompt` / `messages`
   - when `includePreviousOutputs` is true, prepend a synthetic user text
     message with `Previous step outputs:\n<json>`

4. Keep transport thin.
   - strict JSON decode
   - explicit required-field validation
   - `404` for missing parent runs on stop
   - `503` when the managed runtime is not available
   - `400` for invalid step payloads or unsupported external-agent step engines

## Verification Targets

- focused owner tests
  - empty chain completes with persisted outputs and terminal events
  - managed step completion persists child summary into parent outputs
  - stop cancels both the active chain task and the current child managed run
  - mismatched `engineConfigId` inside step inputs fails deterministically
  - external-agent step engines fail explicitly
- focused route tests
  - start success
  - stop success
  - unavailable runtime mapping
  - invalid input mapping
  - share-mode gating
- app wiring tests
  - IDE mode constructs the run-chain runtime owner without reopening Python
    state

## Decisions Made

- reopen runtime work because the user explicitly requested the next step
- keep the first run-chain slice managed-only
- use a dedicated `internal/runchains` owner instead of extending
  `internal/agentruns` into another orchestration singleton
- reuse the landed managed runtime as the child-step execution boundary

## Open Questions

- whether a later clean-break run-chain slice still needs external-agent child
  steps at all
- whether future run-chain progress events need a dedicated realtime surface or
  whether persisted run polling remains sufficient

## Progress Notes

- 2026-03-09: opened the first focused executable Phase 14 run-chain slice for
  managed `start/stopRunChain` over the landed managed-run runtime.

## Next Recommended Step

- implement the managed-only run-chain runtime owner and thin transport
- keep external-agent child-step orchestration deferred until a separate owner
  exists or a concrete caller requires it
