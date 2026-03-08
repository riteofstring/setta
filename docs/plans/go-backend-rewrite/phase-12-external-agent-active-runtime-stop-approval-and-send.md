# Phase 12 External-Agent Active Runtime, Stop/Approval, And Send Route

## Purpose

This doc scopes the next focused Phase 12 slice after the completed
`getExternalAgentChat` hydration read path.

The goal is to move from persisted read-only hydration to real Go ownership of
active external-agent execution:

- live in-memory chat state while a run is active
- stop/cancellation ownership
- approval and question response plumbing
- the external-agent branch of `getLLMResponse`

This is the first Phase 12 follow-on that is large enough to deserve a focused
implementation plan instead of being implied by the broader phase doc.

## Current Status

Completed before this slice:

- `internal/externalagents`
  - persisted chat hydration, latest-run selection, placeholder filtering, and
    external `contextUsage` normalization
- `internal/httpapi/ai_routes.go`
  - thin `/getExternalAgentChat` transport

Still missing:

- active run registry for external-agent execution
- live chat overlays for active runs
- cancellation handles and `stopExternalAgentRun`
- approval/question waiters and `respondExternalAgentApproval`
- the external-agent branch of `getLLMResponse`
- Go-owned adapter execution for the supported external agents

## Scope

This slice should deliver:

- an explicit active external-agent runtime owner in Go
- thin Go transport for:
  - the external-agent branch of `getLLMResponse`
  - `stopExternalAgentRun`
  - `respondExternalAgentApproval`
- runtime-owned live overlay hooks that compose with the completed hydration
  read path
- adapter execution boundaries for the supported product surface:
  - Codex
  - Claude Code
  - OpenCode

It should preserve the current rewrite constraints:

- clean break, no Python-shaped singleton bag
- transport stays thin
- persisted runs remain the durable source of truth
- no heuristic fallbacks where typed runtime state already exists

## Non-Goals

- managed `setta_llm`
- transcription routes
- agent-profile CRUD
- unrelated app-spec or launcher work
- transport-only shims that mark runs cancelled without owning the real active
  execution handle

## Inputs

- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/reference/external-agents.md`
- `backend/setta/routers/ai.py`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_adapters/`
- `tests/routers/test_ai_agent_run_chats.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `internal/externalagents/service.go`
- `internal/agentruns/store.go`
- `internal/mcpx`

## Recommended Design

1. Keep the current `internal/externalagents.Service` read-only.
   - It should remain the durable hydration owner over persisted run data.

2. Add a composed active-runtime sibling for live execution.
   - Suggested shape: `internal/externalagents/runtime.go`
   - Own:
     - active run handles by run id
     - live chat state snapshots by run id
     - pending approvals/questions by id
     - adapter registry and execution dispatch

3. Make the read service depend on an interface, not the runtime concrete type.
   - The completed hydration path already has a `LiveChatStateProvider`
     boundary. Reuse that instead of folding read and live logic together.

4. Keep route responsibilities thin.
   - validate request shape
   - resolve service calls
   - map typed runtime/store errors to HTTP errors

5. Keep adapter-specific behavior at explicit edges.
   - runtime execution settings
   - approval-policy overrides
   - sandbox-policy overrides
   - frontend-affinity-token propagation
   - MCP context wiring

## Proposed Landing Order

1. Active runtime foundation
   - define runtime-owned run state, live chat state, cancellation, and
     approval/question registries
   - add focused runtime tests that do not need the HTTP layer

2. Stop and approval transport
   - add `stopExternalAgentRun`
   - add `respondExternalAgentApproval`
   - wire them to the real active runtime, not a persisted-store shortcut

3. External-agent send route
   - land the external-agent branch of `getLLMResponse`
   - keep validation explicit:
     - `sectionId` vs `allowUnscoped`
     - branch-edit combinations
     - `continueFromChatId`
     - frontend-affinity-token normalization
     - execution settings and approval/sandbox overrides

4. Adapter closeout
   - ensure the supported adapters are all wired through the new runtime before
     considering the Python send path removable

## Verification Targets

- `internal/externalagents` runtime tests for:
  - active run registration and cleanup
  - live overlay retrieval
  - cancellation behavior
  - approval/question state transitions
- `internal/httpapi` tests for:
  - stop route behavior
  - approval route behavior
  - external-agent send validation and preflight failures
- targeted `internal/app` verification after wiring
- reference checks against:
  - `tests/routers/test_ai_agent_run_chats.py`
  - `tests/routers/test_agentic_routes.py`

## Open Questions

- whether to land one adapter end-to-end first or add the generic active
  runtime plus all three supported adapters before switching any send-route
  ownership
  - recommendation: land the generic active runtime first, but do not switch the
    send route fully to Go until all supported adapters have a real Go edge
- whether approval/question routing should share one pending-interaction store
  or keep separate typed registries
  - recommendation: keep separate typed registries keyed by interaction id so
    transport errors stay explicit

## Next Recommended Step

- implement the active runtime foundation first
- do not start with send-route transport alone; it depends on live execution,
  cancellation, and approval ownership to be product-correct
