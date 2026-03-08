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

Completed in this slice:

- `internal/externalagents/runtime.go`
  - active run registry
  - live chat overlay storage behind the existing hydration provider interface
  - cancellation ownership over persisted external runs
  - approval registration and approval-response dispatch
- `internal/externalagentconfigs`
  - Go-owned read store for `external_agents.json`
  - bounded preflight checker interface plus a minimal concrete checker
- `internal/externalagents/send.go`
  - Go-owned external-agent send service layered over the completed runtime
  - persisted running-run creation, `run_started` event persistence, and live
    runtime activation
  - explicit validation and history shaping for the external-agent branch of
    `getLLMResponse`
- `internal/httpapi/ai_routes.go`
  - thin `/getLLMResponse` transport for the external-agent engine branch
  - thin `/stopExternalAgentRun` transport
  - thin `/respondExternalAgentApproval` transport
- `internal/externalagents/codex_executor.go`
  - real Codex app-server execution behind the bounded executor interface
  - Go-owned initialize / thread start-or-resume / turn start lifecycle
  - live assistant-output and approval-request persistence during active runs
  - terminal completion and failure persistence
- `internal/app/app.go`
  - runtime wiring so the hydration read path and send path share the same Go
    runtime owner and external-agent config source of truth
  - bounded multi-executor wiring with the real Codex executor installed in IDE
    mode

Still missing:

- broader Codex/OpenCode/Claude MCP and tool-result parity during live
  execution

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
- `docs/plans/go-backend-rewrite/phase-12-external-agent-send-route-foundation.md`
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

## Completed In This Slice

- added the composed active runtime sibling as planned
- kept `internal/externalagents.Service` read-only and reused its
  `LiveChatStateProvider` boundary
- added `internal/externalagentconfigs` for Go-owned external-agent config
  lookup and bounded preflight checking
- added `internal/externalagents/send.go` so the external-agent branch of
  `getLLMResponse` now resolves state, validates inputs, persists the running
  run, and activates the completed runtime in Go
- added `internal/externalagents/codex_executor.go` so Codex-backed external
  chats now launch and complete through a real Go-owned app-server runtime
- seeded persisted Codex `threadId` into same-chat follow-up runs so Codex
  thread continuity is now Go-owned
- implemented stop ownership against persisted runs plus active controllers
- implemented approval-response dispatch plus persisted approval tool-result
  messages
- extended `internal/externalagents/runtime.go` with a typed pending-question
  registry plus runtime-owned question-response dispatch
- added `internal/externalagents/opencode_executor.go` so OpenCode-backed
  external chats now launch and complete through a real Go-owned sidecar
  runtime with bounded runtime `opencode.json` generation
- seeded persisted OpenCode `sessionId` into same-chat follow-up runs so
  OpenCode session continuity is now Go-owned
- added `internal/externalagentconfigs/claude_runtime.go` so Claude CLI and
  repo-pinned Python SDK availability share one bounded Go source of truth
- added `internal/externalagents/claude_executor.go` so Claude-backed external
  chats now launch and complete through a real Go-owned SDK-bridge runtime
  with bounded managed `.claude/settings*.json` generation
- seeded persisted Claude `sessionId` into same-chat follow-up runs so Claude
  session continuity is now Go-owned
- added thin `/respondExternalAgentQuestion` transport with typed
  not-found/bad-request mapping
- added focused tests for:
  - external-agent config reads and preflight gating
  - external-agent send-path validation, continuation seeding, and conflict
    handling
  - real Codex executor completion and approval round-trip over stdio
  - real OpenCode executor completion and question-response round-trip over
    stdio
  - real Claude executor completion, approval round-trip, and question
    round-trip over stdio
  - `/getLLMResponse` transport over the new send service
  - live overlay retrieval
  - cancellation persistence and cleanup
  - approval/question dispatch and event persistence
  - stop/approval/question HTTP transport behavior

## Verification

- passed:
  - `./scripts/go.sh test ./internal/externalagentconfigs ./internal/externalagents ./internal/httpapi`
  - `./scripts/go.sh test ./internal/app -run '^$'`
  - `source activate.sh && python -m py_compile backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`

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

- keep the completed runtime as the execution owner; do not add a parallel send
  path that bypasses it
- land the deferred MCP-rich item/tool-result parity slice now that Codex,
  OpenCode, and Claude execution, stop, approval, and question ownership are
  all proven on the same runtime boundary
