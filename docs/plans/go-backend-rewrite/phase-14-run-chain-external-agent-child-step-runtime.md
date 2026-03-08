# Phase 14 Run-Chain External-Agent Child-Step Runtime

## Purpose

This doc scopes the next bounded Phase 14 follow-on after the landed managed
run-chain runtime.

The goal of this slice is to let Go-owned `start/stopRunChain` orchestrate
external-agent child steps over an explicit external run owner, without
reopening route transport, without tunneling through `/getLLMResponse`, and
without broadening scope into richer run-chain realtime behavior.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime, execution, prompt, attachment, parity, and
  AI-follow ownership for the bounded external-agent surface
- Phase 13 non-runtime agentic transport ownership
- Phase 14 managed `start/stopAgentRun` ownership
- Phase 14 managed-only `start/stopRunChain` ownership over a dedicated
  `internal/runchains` runtime

Current Go state before this slice:

- `internal/runchains`
  - owns parent chain-run persistence, active chain task lifecycle, managed
    child-step orchestration, snapshot/event recording, and stop cancellation
  - explicitly rejects external-agent-backed child steps
- `internal/externalagents`
  - owns external run activation, cancellation, live chat state, approval and
    question routing, and executor-backed terminal persistence
  - does not yet expose a lower-level non-chat run owner with
    `start/stop/wait` semantics for orchestration callers
  - does not yet expose a first-class wait boundary above executor completion

## Scope

This slice should deliver:

- a bounded Go external-agent run owner for orchestrated non-chat runs
- a waitable external-agent runtime boundary so orchestration callers can block
  until terminal persisted state exists
- run-chain step dispatch for both supported engine types:
  - `setta_llm`
  - `external_agent`
- focused tests for:
  - external child-step success
  - external child-step stop/cancellation
  - synchronous validation for unavailable external runtime / bad external
    inputs

## Non-Goals

- any new HTTP routes or route-shape changes
- reusing `/getLLMResponse` as an internal orchestration transport
- Python-shaped external-run singleton state or storage shape
- richer run-chain websocket/progress streaming
- broad external-agent context parity beyond the landed Go external-run surface
- changing managed run-chain behavior that already landed

## Inputs

- `docs/plans/go-backend-rewrite/phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-managed-runtime-and-transport.md`
- `backend/setta/agentic/run_chain.py`
- `backend/setta/agentic/external_agent_runner.py`
- `tests/agentic/test_run_chain.py`
- `internal/runchains/runtime.go`
- `internal/externalagents/runtime.go`
- `internal/externalagents/send.go`
- `internal/externalagents/service.go`
- `internal/agentruns/runtime.go`

## Planning Findings

### 1. The existing Go external send path is the wrong orchestration boundary

`internal/externalagents.SendService` is intentionally chat-route shaped. It
owns branching, continuation, permission-mode defaults, app-generation prompt
sections, and the HTTP-facing request envelope for `/getLLMResponse`.

Run-chain should not compose through that chat transport abstraction.

### 2. The executor/runtime split is already usable

The landed Codex/OpenCode/Claude executors already:

- start provider processes
- persist terminal run state
- keep live chat state current
- call `runtime.DeactivateRun(runID)` on completion/failure/teardown

What is missing is only the explicit wait boundary above that completion path.

### 3. The clean-break target is a lower-level external run owner

Run-chain external child steps should use an explicit Go owner that:

- resolves the external engine config and config store entry
- runs preflight through the bounded checker
- validates project/section scope and known input shape
- starts a persisted external run directly against the existing executor
  boundary

That owner should accept run inputs, not a chat-route request shape.

### 4. Child-step chat continuity should stay explicit

If a chain step does not provide `chatId`, the Go owner should create a fresh
external chat identity for that run. If a caller wants continuity, it should
provide `chatId` explicitly and let the owner seed session/thread continuity
from the latest run for that chat.

That keeps continuity source-of-truth-driven instead of heuristic.

## Recommended Design

### 1. Add an external-agent run service above the landed runtime

Recommended shape:

- `internal/externalagents.RunService`
  - `ValidateRun(profile, inputs) error`
  - `StartRun(ctx, profile, inputs) (agentruns.Run, error)`
  - `Disabled() bool`

Responsibilities:

- resolve the selected external engine and external-agent config
- run bounded preflight
- validate:
  - `projectConfigId`
  - `sectionId` / `allowUnscoped`
  - `engineConfigId`
  - `prompt`
  - `messages`
- normalize initial user messages for prompt-only runs
- merge agent-profile prompt content into `systemPrompt`
- attach token-backed attachment payloads when messages include attachments
- seed same-chat session continuity only when `chatId` is explicitly provided
- persist the running run and `run_started` event
- activate runtime, initialize live chat state, and start the executor

### 2. Extend the external-agent runtime with `WaitForRun`

Recommended shape:

- active runtime state stores a `done` channel per active run
- `ActivateRun` initializes that wait channel
- `DeactivateRun` closes it before cleanup
- `StopRun` also closes it when cancellation makes the run terminal
- new method:
  - `WaitForRun(ctx, runID) (agentruns.Run, error)`

That gives run-chain the same explicit `start/stop/wait` orchestration model it
already uses for managed child steps.

### 3. Keep `internal/runchains` as the orchestrator

Recommended changes:

- add an optional external-step runner dependency to `internal/runchains`
- validate each step by resolved engine type:
  - managed steps continue using the landed managed runtime path
  - external steps validate through the new external run owner
- dispatch child execution by engine type
- stop the active child step through the matching runtime owner

### 4. Keep transport thin and unchanged

`POST /startRunChain` and `POST /stopRunChain` should remain unchanged.

Only error mapping needs expansion for:

- unavailable external child-step runtime
- unavailable external preflight

## Verification Targets

- `internal/externalagents`
  - run service start persists a running run and initializes live chat state
  - runtime wait unblocks on completion/stop cleanup
- `internal/runchains`
  - external child-step success
  - external child-step stop/cancellation
  - synchronous validation for unavailable external runtime
- `internal/httpapi`
  - `startRunChain` maps external runtime/preflight failures deterministically
- `internal/app`
  - IDE wiring can construct the new external run owner and pass it into the
    run-chain runtime

## Decisions Made

- keep the next follow-on inside Phase 14 instead of opening a new transport
  phase
- use a lower-level external run owner instead of routing run-chain through the
  chat send service
- add a wait boundary to the landed external runtime instead of inventing a
  second active external task registry
- keep run-chain orchestration ownership in `internal/runchains`

## Progress Notes

- 2026-03-09: opened the focused follow-on for Go-owned external-agent
  child-step orchestration above the landed managed run-chain runtime.

## Next Recommended Step

- land the bounded external-agent run owner plus runtime wait boundary
- wire `internal/runchains` to dispatch external child steps through that new
  owner
