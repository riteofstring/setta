# Phase 12 External-Agent AI Runtime And Route Foundation

## Purpose

This doc scopes the next bounded backend-runtime phase after the completed
Phase 11 shipped CLI migration closeout.

The goal is to keep AI usable in the rewrite without rebuilding a Go equivalent
to LiteLLM. The current rewrite direction is to require external agents
(`codex`, `claude code`, `opencode`) instead of porting managed `setta_llm`.

That means Phase 12 now focuses on moving the external-agent AI runtime and the
user-facing AI route ownership from Python to Go without broadening into
transcription or unrelated frontend surface.

## Current Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity is complete for the tracked Python MCP surface
- Phase 7 deployment/launcher runtime ownership is complete for its bounded
  cluster
- Phases 8-11 shipped CLI migration slices are complete
- Go already owns reusable foundations in:
  - `internal/agentruns` for persisted run storage and engine-config parsing
  - `internal/agentprofiles` for stored profile loading
  - `internal/mcpx` for scoped MCP transport and tool execution
  - `internal/httpapi`, `internal/realtime`, and `internal/app` for thin route
    wiring and websocket fanout infrastructure
- Python still owns the external-agent AI/chat path in:
  - `backend/setta/routers/ai.py`
  - `backend/setta/routers/agentic.py`
  - `backend/setta/agentic/external_agent_runner.py`
  - `backend/setta/agentic/external_adapters/*`
- managed `EngineType.setta_llm` remains Python-owned, but it is no longer the
  planned Go target for the current rewrite scope
- there is still no Go-owned AI route cluster for the external-agent path:
  - the `EngineType.external_agent` branch of `route_get_llm_response`
  - `route_get_external_agent_chat`
  - `route_stop_external_agent_run`
  - `route_respond_external_agent_approval`
- current work is planning/inventory for that remaining backend-runtime gap,
  not another CLI or launcher slice

## Scope

This phase should cover:

- explicit Go owner for the external-agent chat send, hydrate, stop, and
  approval flows used by Project Chat and managed Chat sections
- a real Go runtime boundary above the existing run store and MCP foundations
  for:
  - live in-memory chat state while runs are active
  - cancellation/stop ownership
  - adapter-backed streaming execution
  - approval request/response plumbing
  - websocket/event fanout needed by the existing frontend chat UX
- thin Go AI transport for:
  - the external-agent branch of `route_get_llm_response`
  - `route_get_external_agent_chat`
  - `route_stop_external_agent_run`
  - `route_respond_external_agent_approval`
- external-agent branch/edit and `continueFromChatId` behavior where it applies
- external-agent `contextUsage` and tool-call hydration from the canonical run
  data path
- external-agent runtime execution settings:
  - `permissionMode`
  - `searchEnabled`
  - `frontendAffinityToken`

It should include:

- a new Go-owned external-agent runtime package or an equally explicit sibling
  runtime boundary over the completed store/transport foundations
- explicit reuse of `internal/agentruns` run storage and engine-config types
  where that keeps the source of truth single
- explicit reuse of `internal/mcpx` for namespaced MCP tool execution
- focused Go route tests mirroring the external-agent Python reference coverage
- explicit adapter boundaries for:
  - Codex app-server
  - Claude Code
  - OpenCode

## Non-Goals

- Go-owned managed `EngineType.setta_llm`
- any LiteLLM-equivalent provider abstraction for first-party model APIs
- transcription profile or transcription session routes
- agent-profile CRUD routes
- app-spec streaming and unrelated app-generation follow-ons
- launcher, installer, packaged CLI, or release-surface work
- reopening MCP, PTY, or LSP library decisions
- a direct port of the old Python object graph or any compatibility shim back
  through Python

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/reference/external-agents.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/chat-sections.md`
- `backend/setta/routers/ai.py`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_adapters/`
- `tests/routers/test_ai_agent_run_chats.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/state/actions/aiStopProjectChat.test.ts`
- `internal/agentruns/service.go`
- `internal/agentruns/types.go`
- `internal/app/app.go`

## Current Python Behavior

1. `route_get_llm_response` owns the external-agent send branch
   - validates `sectionId` versus `allowUnscoped`
   - rejects invalid branch-edit and `continueFromChatId` combinations
   - resolves the external engine config and optional agent profile
   - builds combined prompt sections for app-generation mode and execution
     policy
   - normalizes `frontendAffinityToken`
   - applies external approval/sandbox policy overrides from
     `permissionMode` where required
   - starts the background run through `ExternalAgentRunner.start_run(...)`

2. `ExternalAgentRunner` owns the external-agent runtime
   - persists external runs and lifecycle events
   - keeps per-run live chat state in memory during active execution
   - streams agent/tool deltas back to the frontend
   - brokers approval requests and responses while runs are active
   - supports stop/cancellation through `stop_run(...)`

3. The user-facing external-agent routes depend on both persisted and live
   state
   - `route_get_external_agent_chat` selects the latest run for the chat
   - `build_chat_state_from_run(...)` reconstructs the durable message state
   - `ExternalAgentRunner.get_live_chat_state(...)` overlays active output
     while a run is still in flight
   - `route_stop_external_agent_run` stops a specific external run
   - `route_respond_external_agent_approval` routes UI approval decisions back
     to the active adapter run

4. The current Python tests already show a bounded reference surface for the
   first Go phase
   - external-agent send-path validation and preflight failures
   - external chat hydration from persisted runs plus live overlays
   - latest-run selection and typed chat-not-found behavior
   - `continueFromChatId` validation and seeding
   - branch-edit validation
   - frontend-affinity-token handling
   - frontend stop-route dispatch for external runs

## Current Go Foundations

- `internal/agentruns`
  - already owns persisted run storage and engine-config parsing that can be
    reused by an external-agent runtime owner
- `internal/agentprofiles`
  - owns stored agent-profile loading for profile-backed runs
- `internal/mcpx`
  - owns the scoped MCP server/client/tool boundary that external agents will
    call
- `internal/httpapi`, `internal/realtime`, and `internal/app`
  - already own the route, websocket, and application wiring patterns that the
    new AI runtime should plug into

Missing Go owners:

- external-agent adapter registry and runtime owner
- live chat-state registry for active external runs
- approval request/response runtime boundary
- external-agent websocket/event streaming owner
- AI HTTP routes for external send/hydrate/stop
- Go ownership of the user-facing external-agent approval transport

## Working Decisions

- external agents are the supported AI runtime for the current rewrite target
- do not port or recreate managed `setta_llm` in Go unless a future product
  decision explicitly reopens it
- keep transport thin
  - request validation, context extraction, service invocation, and response
    mapping belong in `internal/httpapi`, not in the runtime owner
- keep persisted agent runs as the source of truth
  - hydrate chat state from run data and overlay live in-memory state only while
    a run is active
- do not rebuild the old Python singleton/state bag
  - use explicit Go runtime/service boundaries for adapter execution, chat
    state, MCP dispatch, and websocket fanout
- keep external integrations at explicit adapter edges
  - use stable SDKs, CLI protocols, or sidecars only where the external agent
    itself requires them, but keep Setta semantics in Go
- do not implement heuristic fallbacks for scope or context behavior where the
  current runtime already has typed source-of-truth inputs

## Proposed Landing Order

1. Stage 1: external-agent runtime foundation
   - add the Go-owned runtime package above `internal/agentruns` and
     `internal/mcpx`
   - own adapter registration, live chat-state tracking, cancellation handles,
     approval callbacks, and streaming/event interfaces
   - start with the supported adapters already documented for the product:
     Codex, Claude Code, and OpenCode

2. Stage 2: external-agent chat transport
   - add thin Go transport for:
     - the `EngineType.external_agent` branch of `getLLMResponse`
     - `getExternalAgentChat`
     - `stopExternalAgentRun`
     - `respondExternalAgentApproval`
   - mirror the existing typed not-found, latest-run, live-overlay, and
     approval-response behaviors

3. Stage 3: external-agent send-route closeout
   - keep thin route-level semantics explicit:
     - section/unscoped validation
     - branch-edit validation
     - `continueFromChatId`
     - frontend-affinity-token propagation
     - permission/search prompt metadata
     - external approval/sandbox policy overrides where the adapter expects
       them

4. De-scoped follow-on unless re-opened deliberately
   - do not create a Go-owned managed `setta_llm` runtime as part of this phase
   - if product requirements change later, plan that as a separate explicit doc

5. Later follow-ons, if still needed
   - transcription session runtime and transport
   - any remaining agentic route/runtime ownership outside the external-agent
     chat surface

## Verification Targets

- owner-package Go tests for the new external-agent runtime and adapter edges
- focused `internal/httpapi` tests for:
  - external-agent send validation
  - external chat hydration
  - external stop routes
  - approval response routes
- targeted reference checks against the existing Python route tests for:
  - branch-edit and continuation validation
  - frontend-affinity-token normalization
  - external chat hydration
  - external-agent preflight failures

## Open Questions

- whether to broaden `internal/agentruns.Service` for external-agent execution
  or add a sibling external-agent runtime package that reuses the same store
  types
  - current recommendation: keep managed and external execution separate at the
    runtime-service layer, even if they share the persisted run store and engine
    config types
- whether Claude Code should stay behind a narrow Python/CLI boundary or switch
  to a pure Go edge if a stable official interface exists
  - current recommendation: use the most stable official interface available at
    the adapter edge and avoid inventing a generic polyglot orchestration layer
- whether AI-follow and reveal-side integration must land in Stage 1 or can be
  deferred behind the same live-state owner until the frontend proves it is
  blocked
  - current recommendation: keep only the pieces required by the current
    external-agent chat UX in scope for the first landing

## Progress Notes

- 2026-03-08: created the original Phase 12 planning doc after re-reading the
  current Python AI/chat routes and runtime against the Go codebase.
- 2026-03-08: after reviewing the lack of a trustworthy Go LiteLLM equivalent,
  repurposed Phase 12 around external agents only instead of porting managed
  `setta_llm`.
- 2026-03-08: external agents (`codex`, `claude code`, `opencode`) are now the
  planned AI surface for the rewrite; managed `setta_llm` is intentionally
  de-scoped unless a later product decision reopens it.

## Verification

- docs-only planning update; no runtime tests were needed for this decision

## Recommended Next Step

Implement Phase 12 Stage 1 from this doc:

- add the explicit Go external-agent runtime owner
- keep the adapter edges explicit
- do not broaden into managed `setta_llm` or transcription work
