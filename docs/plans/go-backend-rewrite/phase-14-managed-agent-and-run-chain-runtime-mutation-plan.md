# Phase 14 Managed-Agent And Run-Chain Runtime Mutation Plan

## Purpose

This doc scopes the remaining Python-owned agentic mutation surface after the
Phase 13 transport closeout.

At this point, the rewrite no longer has a hidden hydration or settings
transport gap. The remaining runtime-shaped follow-on surface originally was:

- `POST /startAgentRun`
- `POST /stopAgentRun`
- `POST /startRunChain`
- `POST /stopRunChain`

The goal here is not to force another transport slice. It is to record the
smallest honest follow-on if product work ever reopens this surface, while
keeping the clean-break rewrite constraints explicit.

## Current Status

Completed before this plan:

- Phase 12 external-agent runtime and route ownership for the bounded
  external-agent surface
- Phase 13 direct hydration, settings mutation, dormant single-item read, and
  persisted agent-run read transport ownership

Current Python-owned route surface after the landed run-chain follow-on:

- none for the current bounded clean-break scope
- the deferred follow-on is no longer route transport
- the only remaining question is whether product work still needs Python's
  older external-agent child-step orchestration inside run-chain

Current caller status relevant to scope:

- the Phase 13 inventory did not find a live direct frontend caller for any of
  those four routes
- current evidence for this surface now comes from Python tests and generated
  bindings, not a known active UI dependency

Current Go foundations already landed:

- `internal/agentruns`
  - `RunStore` for persisted `agent_runs/`
  - `EngineStore` for `engine_configs.json`
  - `Service.RunSubAgent(...)` for synchronous managed-run execution to a final
    persisted `AgentRun`
- `internal/externalagents`
  - active external-agent runtime, cancellation, approval/question routing,
    and persisted run ownership
- `internal/httpapi/agent_run_routes.go`
  - Go-owned `GET /getAgentRuns`
  - Go-owned `POST /getAgentRun`

What is still deferred in Go after the landed follow-ons:

- external-agent child-step orchestration inside run-chain
- any richer run-chain progress realtime surface beyond persisted run polling

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-remaining-agentic-route-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-13-agent-run-read-transport-closeout.md`
- `docs/plans/go-backend-rewrite/phase-6-managed-agent-run-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-run-agent-profile-tool-parity.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/llm/agent_runner.py`
- `backend/setta/agentic/run_chain.py`
- `backend/setta/server_state.py`
- `tests/routers/test_agentic_routes.py`
- `tests/agentic/test_run_chain.py`
- `internal/agentruns/service.go`
- `internal/externalagents/runtime.go`
- `internal/httpapi/agent_run_routes.go`

## Current Python Behavior

### 1. `POST /startAgentRun`

- loads the requested profile
- resolves the profile engine config
- dispatches by engine type:
  - `EngineType.setta_llm` -> `AgentRunner.start_run(...)`
  - `EngineType.external_agent` -> `ExternalAgentRunner.start_run(...)`
- validates external-agent preflight and tool allowlist inline before the
  external branch starts

### 2. `POST /stopAgentRun`

- only targets the managed `AgentRunner`
- does not route through the external-agent runner
- cancels the active managed task and persists terminal run state

### 3. `POST /startRunChain`

- delegates to `RunChainRunner.start_run(...)`
- persists a parent chain run
- spawns a background task for chain execution
- runs each step against either the managed runner or the external-agent
  runner, depending on step engine type
- writes chain events, snapshots, and per-step summaries back into the parent
  persisted run

### 4. `POST /stopRunChain`

- cancels the chain task if still active
- also stops the currently active child step run through the relevant runner
- marks the parent chain run cancelled and persists terminal state

## Planning Findings

### 1. This is runtime work, not transport cleanup

The remaining Python handlers sit on top of in-memory task registries,
cancellation, persisted lifecycle updates, and child-run orchestration. The
existing Go `agentruns.Service.RunSubAgent(...)` is intentionally completion
oriented; it does not expose an active task registry or cancellation boundary.

### 2. Python's hybrid `startAgentRun` behavior should not be copied forward

Python currently lets `POST /startAgentRun` start either a managed run or an
external-agent run based on the selected engine config.

That is not the right clean-break target.

Go already owns external-agent execution through `/getLLMResponse`,
`/stopExternalAgentRun`, `/respondExternalAgentApproval`, and
`/respondExternalAgentQuestion` plus the active `internal/externalagents`
runtime. Reopening `startAgentRun` should not reintroduce a compatibility path
that tunnels external-agent execution through a managed-agent route.

### 3. Managed-agent runtime and run-chain runtime should be split

These are related, but they are not the same slice:

- managed-agent start/stop needs an active runtime boundary above the existing
  `internal/agentruns.Service`
- run-chain needs a parent-run orchestrator plus child-step execution over one
  or more runtimes

Trying to land both together would broaden scope immediately into orchestration
and cross-runtime cancellation.

Later outcome:

- the user explicitly requested that runtime work proceed
- that led to the bounded follow-on now landed in
  `phase-14-managed-agent-start-stop-runtime-and-transport.md`
- Go now owns managed `POST /startAgentRun` and `POST /stopAgentRun`
- the only remaining Python-owned runtime mutation surface is now run-chain
- the next focused executable follow-on is now opened in
  `phase-14-run-chain-managed-runtime-and-transport.md`

### 4. No concrete caller currently forces this work

The prior inventory still holds:

- no active direct frontend caller was found for these routes
- the current rewrite therefore does not need to reopen this runtime surface
  automatically

## Recommended Design

### Slice A: managed-agent start/stop runtime

Later outcome:

- landed in `phase-14-managed-agent-start-stop-runtime-and-transport.md`
- Go now owns:
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
- that route remains managed-only and rejects external-agent-backed profiles

Recommended owner shape:

- new bounded `internal/agentruns` runtime type or adjacent package-level owner
- active-run registry keyed by run id
- `context.Context` cancellation per active run
- persisted lifecycle updates through the existing `RunStore`
- reuse of the existing `Service` for context building, system prompt
  generation, and executor invocation where practical

Recommended transport behavior:

- thin IDE-only route handlers in `internal/httpapi/agent_run_routes.go`
- strict JSON decode
- explicit required-field validation
- `404` for missing persisted/active runs on stop
- `503` when managed execution is not wired
- explicit `400` when the selected profile is not backed by a managed engine

Non-goals for Slice A:

- external-agent compatibility through `startAgentRun`
- websocket AI-follow parity
- run-chain orchestration
- broad managed chat/runtime parity with Python `AgentRunner`

### Slice B: run-chain runtime, only if still needed

Later outcome:

- the user explicitly requested the next runtime step proceed
- that opened the focused managed-only run-chain slice in
  `phase-14-run-chain-managed-runtime-and-transport.md`
- external-agent child-step orchestration remains deferred in that slice

Recommended second executable follow-on, if the product still needs it:

- add a dedicated run-chain owner instead of burying orchestration inside route
  handlers
- treat the parent chain run as its own persisted runtime concern
- compose child execution through explicit managed-run and external-agent step
  executors, not through Python-shaped global runner state

Open design questions for that future slice:

- whether run-chain still needs both managed and external-agent step types
- whether external-agent steps should reuse the landed Go external-agent send
  path directly or require a narrower orchestration entrypoint
- whether run-chain still has a real caller at all

## Non-Goals

- reopening managed `setta_llm` chat-route parity
- recreating Python `AgentRunner` state 1:1 in Go
- preserving Python hybrid external-agent dispatch through `startAgentRun`
- migrating dormant runtime routes just because bindings still exist
- bundling run-chain implementation into the first managed start/stop slice

## Verification Targets For A Future Runtime Slice

- focused owner tests
  - start persists a running run before execution advances
  - stop cancels the active context and persists terminal state
  - missing run ids fail deterministically
  - unsupported external-agent-backed profiles fail explicitly
- focused route tests
  - start success
  - stop success
  - not-found and unavailable-runtime mapping
  - share-mode gating
- app wiring tests
  - IDE mode can construct the managed runtime owner without reopening Python
    runner state

## Decisions Made

- treat the remaining agentic mutation surface as Phase 14 runtime planning
  work, not as another Phase 13 transport cleanup
- do not preserve Python's hybrid `startAgentRun` external-agent dispatch if
  this surface is reopened in Go
- split future execution into:
  - a bounded managed start/stop runtime slice first
  - a separate run-chain decision later, only if a concrete caller still needs
    it

## Open Questions

- whether run-chain still has a real caller or is purely dormant legacy
  surface
- whether a future run-chain slice still needs both managed and external-agent
  step types in the clean-break Go design

## Verification

- docs and inventory only; no automated tests were run

## Next Recommended Step

- treat this Phase 14 plan as the current handoff for the remaining runtime
  mutation surface
- treat managed `start/stopAgentRun` as complete for the current bounded scope
- do not open run-chain implementation automatically without a caller or
  explicit product/runtime decision
- that explicit decision has now been made, so the active follow-on is the
  managed-only run-chain slice in
  `phase-14-run-chain-managed-runtime-and-transport.md`
