# Phase 14 Run-Chain External-Agent Child-Step Runtime

## Purpose

This doc records the landed Phase 14 follow-on after the managed-only
run-chain slice.

The goal of this slice was to let Go-owned `start/stopRunChain` orchestrate
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

Current Go state after this slice:

- `internal/externalagents`
  - now owns a bounded `RunService` for orchestrated non-chat external runs
  - now exposes `Runtime.WaitForRun(...)` over the existing executor lifecycle
  - still keeps executor/process ownership, live chat state, stop
    cancellation, approval/question routing, and terminal persistence in the
    same runtime boundary
- `internal/runchains`
  - now orchestrates child steps for both supported engine types:
    - `setta_llm`
    - `external_agent`
  - still owns parent chain-run persistence, active chain task lifecycle,
    step summaries, and stop cancellation
- `internal/httpapi/agent_run_routes.go`
  - still owns thin `POST /startRunChain` and `POST /stopRunChain`
  - now maps external-step unavailability and preflight failures explicitly
- `internal/app.App`
  - now wires the run-chain runtime through both the managed and external
    step owners in IDE mode
  - no longer treats the run-chain runtime as disabled just because the
    managed executor path is still unwired

## Scope

This slice delivered:

- a bounded Go external-agent run owner for orchestrated non-chat runs
- a waitable external-agent runtime boundary above the landed executor loops
- run-chain child-step dispatch by resolved engine type
- focused tests for:
  - external child-step success
  - external child-step stop/cancellation
  - synchronous validation for unavailable external runtime
  - external run-owner start and preflight validation
  - external runtime wait behavior

## Non-Goals

- any new HTTP routes or route-shape changes
- reusing `/getLLMResponse` as an internal orchestration transport
- Python-shaped external-run singleton state or storage shape
- richer run-chain websocket/progress streaming
- broad external-agent context parity beyond the landed Go external-run surface
- changing the managed run-chain behavior that already landed

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-14-run-chain-managed-runtime-and-transport.md`
- `backend/setta/agentic/run_chain.py`
- `backend/setta/agentic/external_agent_runner.py`
- `tests/agentic/test_run_chain.py`
- `internal/runchains/runtime.go`
- `internal/externalagents/runtime.go`
- `internal/externalagents/send.go`
- `internal/externalagents/service.go`
- `internal/agentruns/runtime.go`

## Implementation Notes

1. Add a lower-level external run owner instead of routing run-chain through
   the chat send service.
   - `internal/externalagents.RunService` now validates project/section scope,
     resolves the external engine/config pair, runs bounded preflight,
     normalizes prompt-only runs into initial user messages, merges agent
     profile prompt content into `systemPrompt`, and starts the existing
     executor boundary directly

2. Reuse the landed external runtime instead of inventing a second active task
   registry.
   - active external run state now carries a `done` channel
   - `Runtime.WaitForRun(...)` now blocks until executor teardown closes that
     channel or cancellation makes the run terminal

3. Keep run-chain orchestration ownership in `internal/runchains`.
   - `RuntimeOptions` now accept an optional external step runner
   - the owner validates each step by resolved engine type
   - child-step stop dispatch now routes through the matching managed or
     external owner

4. Preserve only the product semantics that matter for persisted runs.
   - external child steps still use the same parent/child run metadata shape
     as the managed slice
   - prompt-only external steps now get deterministic initial user messages so
     persisted/live chat state stays source-of-truth-driven
   - when `includePreviousOutputs` is true, the synthetic context message now
     gets a generated message id so the external chat state normalizer can own
     it directly

5. Keep transport thin.
   - no new routes
   - no route-shape changes
   - only error mapping expanded for:
     - unavailable external child-step runtime
     - external-agent preflight failure
     - generic run-chain unavailability when neither child-step owner is wired

## Verification

- `./scripts/go.sh test ./internal/externalagents -count=1`
- `./scripts/go.sh test ./internal/runchains -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'AgentRun|RunChain' -count=1`
- `./scripts/go.sh test ./internal/app -run 'ManagedAgentRun|RunChain' -count=1`

## Decisions Made

- use a lower-level external run owner instead of routing run-chain through the
  chat send service
- add a wait boundary to the landed external runtime instead of inventing a
  separate orchestration-specific registry
- keep the run-chain owner as the parent-run orchestrator for both step types
- let run-chain availability depend on either child-step owner being wired,
  not only on the managed path

## Open Questions

- the later closeout inventory in
  `phase-14-run-chain-caller-and-progress-closeout.md` confirmed that current
  frontend behavior already relies on persisted run polling and that Python did
  not expose a dedicated run-chain realtime channel to preserve
- whether any later follow-on should broaden external child-step semantics
  beyond the current bounded Go external-run surface

## Progress Notes

- 2026-03-09: opened the focused follow-on for Go-owned external-agent
  child-step orchestration above the landed managed run-chain runtime.
- 2026-03-09: landed the Go-owned external-agent child-step follow-on over a
  bounded `internal/externalagents.RunService`, runtime wait boundary, and the
  existing `internal/runchains` parent owner.
- 2026-03-09: the later closeout inventory confirmed no remaining caller-backed
  or realtime-parity gap inside the bounded Phase 14 scope.

## Next Recommended Step

- treat the current bounded Phase 14 agentic runtime route surface as complete
- use `phase-14-run-chain-caller-and-progress-closeout.md` as the closeout
  handoff
- only reopen this area for a concrete new caller or product decision that
  broadens run-chain UX or external child-step behavior beyond the current
  bounded surface
