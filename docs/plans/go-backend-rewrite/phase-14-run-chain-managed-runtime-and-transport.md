# Phase 14 Run-Chain Managed Runtime And Transport

## Purpose

This doc records the landed run-chain follow-on under the broader Phase 14
runtime-mutation plan.

The goal of this slice was to land Go-owned `POST /startRunChain` and
`POST /stopRunChain` for managed `setta_llm` child steps only, without
widening scope into external-agent child-run orchestration.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and transport ownership for the bounded
  external-agent surface
- Phase 13 non-runtime agentic transport ownership
- Phase 14 managed `POST /startAgentRun` and `POST /stopAgentRun` ownership in
  `phase-14-managed-agent-start-stop-runtime-and-transport.md`

Current Go state after this slice:

- `internal/runchains`
  - now owns parent chain-run persistence, active chain task lifecycle,
    managed child-step orchestration, snapshot/event recording, and stop
    cancellation
- `internal/httpapi/agent_run_routes.go`
  - now owns:
    - `GET /getAgentRuns`
    - `POST /getAgentRun`
    - `POST /startAgentRun`
    - `POST /stopAgentRun`
    - `POST /startRunChain`
    - `POST /stopRunChain`
- `internal/app.App`
  - now wires the run-chain runtime in IDE mode
  - keeps that runtime disabled in real app behavior until a managed executor
    is wired

## Scope

This slice delivered:

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

## Implementation Notes

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

5. The run-chain owner now validates known managed-step input shape
   synchronously before persisting the parent chain run.
   - child-step `engineConfigId` mismatch, unsupported engine type, missing
     profile references, bad `allowUnscoped` / `thinking` / `messages` shape,
     and project/section scope errors now fail directly from the route
   - when a step has no `sectionId`, the owner sets `allowUnscoped = true`
     before child managed execution so chain steps do not depend on an
     ad hoc section binding

## Verification

- `./scripts/go.sh test ./internal/runchains -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'RunChain|AgentRun' -count=1`
- `./scripts/go.sh test ./internal/app -run 'ManagedAgentRun|RunChain' -count=1`

## Decisions Made

- reopen runtime work because the user explicitly requested the next step
- keep the first run-chain slice managed-only
- use a dedicated `internal/runchains` owner instead of extending
  `internal/agentruns` into another orchestration singleton
- reuse the landed managed runtime as the child-step execution boundary
- validate known managed-step input shape before parent-run creation so invalid
  chains fail synchronously instead of as background failures

## Open Questions

- that later clean-break run-chain slice was reopened and landed in
  `phase-14-run-chain-external-agent-child-step-runtime.md`
- the later closeout inventory in
  `phase-14-run-chain-caller-and-progress-closeout.md` confirmed that
  persisted run polling is the current frontend source of truth and that no
  separate Python run-chain realtime surface remained to migrate

## Progress Notes

- 2026-03-09: opened the first focused executable Phase 14 run-chain slice for
  managed `start/stopRunChain` over the landed managed-run runtime.
- 2026-03-09: landed the Go-owned managed-only run-chain runtime and thin
  `start/stopRunChain` transport over `internal/runchains`.
- 2026-03-09: the later external-agent child-step follow-on landed in
  `phase-14-run-chain-external-agent-child-step-runtime.md`.
- 2026-03-09: the later closeout inventory confirmed no remaining caller-backed
  or realtime-parity gap under the current Phase 14 scope.

## Next Recommended Step

- follow the landed external-agent child-step slice in
  `phase-14-run-chain-external-agent-child-step-runtime.md`
- after that, use
  `phase-14-run-chain-caller-and-progress-closeout.md` as the closeout handoff
  and only reopen this area for new caller-backed product work
