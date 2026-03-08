# Phase 12 Managed Chat Runtime And AI Route Foundation

## Purpose

This doc scopes the next bounded backend-runtime phase after the completed
Phase 11 shipped CLI migration closeout.

The goal is to move the managed Setta-LLM chat runtime and AI route ownership
from Python to Go without broadening into external-agent chat, transcription,
or unrelated frontend surface.

## Current Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity is complete for the tracked Python MCP surface
- Phase 7 deployment/launcher runtime ownership is complete for its bounded
  cluster
- Phases 8-11 shipped CLI migration slices are complete
- Go already owns the bounded managed-run prerequisites in
  `internal/llmconfig`, `internal/agentruns`, `internal/agentprofiles`, and
  `internal/mcpx`
- Python still owns the managed chat HTTP/runtime path in:
  - `backend/setta/routers/ai.py`
  - `backend/setta/llm/agent_runner.py`
- there is still no Go-owned AI route cluster for:
  - `getLLMResponse`
  - `getLLMChat`
  - `stopLLMChat`
- current work is planning/inventory for that remaining backend-runtime gap,
  not another CLI or launcher slice

## Scope

This phase should cover:

- explicit Go owner for managed Setta-LLM chat send, hydrate, and stop flows
- a real Go runtime boundary above `internal/agentruns` for:
  - live in-memory chat state while runs are active
  - cancellation/stop ownership
  - provider-backed streaming execution
  - websocket/event fanout needed by the existing frontend chat UX
- thin Go AI transport for:
  - `route_get_llm_response`
  - `route_get_llm_chat`
  - `route_stop_llm_chat`
- managed-chat branch/edit and `continueFromChatId` behavior where it applies
- managed-chat `llmConfig` and context-usage hydration from the canonical run
  data path

It should include:

- a new Go-owned managed chat runtime package under `internal/llm` or another
  equally explicit runtime boundary
- explicit reuse of `internal/agentruns` for persisted run data instead of
  inventing a second chat persistence path
- explicit reuse of `internal/llmconfig` for config resolution and runtime API
  keys
- explicit reuse of `internal/mcpx` for namespaced MCP tool execution
- focused Go route tests mirroring the managed-chat Python reference coverage

## Non-Goals

- external-agent chat send/hydrate/stop parity
- transcription profile or transcription session routes
- agent-profile CRUD routes
- app-spec streaming and unrelated app-generation follow-ons
- launcher, installer, packaged CLI, or release-surface work
- reopening MCP, PTY, or LSP library decisions
- a direct port of the old Python object graph or any compatibility shim back
  through Python

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-6-managed-agent-run-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/chat-sections.md`
- `backend/setta/routers/ai.py`
- `backend/setta/llm/agent_runner.py`
- `backend/setta/agentic/chat_view.py`
- `tests/routers/test_ai_agent_run_chats.py`
- `tests/llm/test_llm_chat_manager_streaming.py`
- `tests/llm/test_llm_chat_manager_tools.py`
- `internal/agentruns/service.go`
- `internal/llmconfig/config.go`
- `internal/app/app.go`

## Current Python Behavior

1. `route_get_llm_response` owns managed-chat send semantics
   - validates `sectionId` versus `allowUnscoped`
   - rejects invalid branch-edit and `continueFromChatId` combinations
   - resolves engine config and optional agent profile
   - builds combined prompt sections for app-generation mode and execution
     policy
   - normalizes `frontendAffinityToken`
   - starts the background run through `AgentRunner.start_run(...)`

2. `AgentRunner` owns the managed chat runtime
   - persists managed runs and lifecycle events
   - keeps per-run live chat state in memory during active execution
   - streams model/tool deltas back to the frontend
   - routes MCP tool calls through the configured MCP clients
   - supports stop/cancellation through `stop_run(...)`

3. `route_get_llm_chat` and `route_stop_llm_chat` depend on both persisted and
   live state
   - hydration selects the latest run for the chat
   - `build_chat_state_from_run(...)` reconstructs the durable message state
   - `AgentRunner.get_live_chat_state(...)` overlays active output while a run
     is still in flight
   - stop selects the latest running run, cancels it, and returns
     `alreadyStopped`, `stoppedRunId`, and `stoppedMessageId`

4. The current Python tests already show a bounded reference surface for the
   first Go phase
   - managed hydration from persisted runs
   - latest-run selection
   - typed chat-not-found behavior
   - `continueFromChatId` validation and seeding
   - branch-edit validation
   - frontend-affinity-token handling
   - stop semantics and stopped-message selection

## Current Go Foundations

- `internal/llmconfig`
  - owns `llm_config.json` parsing, validation, default selection, request
    parameter derivation, and runtime API-key snapshots
- `internal/agentruns`
  - owns managed engine resolution, persisted run storage, and a bounded
    managed-run service with an injected executor boundary
- `internal/agentprofiles`
  - owns stored agent-profile loading for profile-backed managed runs
- `internal/mcpx`
  - owns the MCP server/client/tool boundary that managed chat will call
- `internal/app`
  - already wires the managed-run foundation into IDE mode

Missing Go owners:

- provider-backed managed chat executor
- live chat-state registry for active runs
- managed-chat websocket/event streaming owner
- managed-chat stop/cancel runtime boundary
- AI HTTP routes for send/hydrate/stop

## Working Decisions

- keep transport thin
  - request validation, context extraction, service invocation, and response
    mapping belong in `internal/httpapi`, not in the runtime owner
- keep persisted agent runs as the source of truth
  - hydrate chat state from run data and overlay live in-memory state only while
    a run is active
- do not rebuild the old Python singleton/state bag
  - use explicit Go runtime/service boundaries for provider execution, chat
    state, MCP dispatch, and websocket fanout
- keep the first bounded Phase 12 slice limited to `EngineType.setta_llm`
- do not implement heuristic fallbacks for scope or context behavior where the
  current runtime already has typed source-of-truth inputs

## Proposed Landing Order

1. Stage 1: managed chat runtime foundation
   - add the Go-owned runtime package above `internal/agentruns`,
     `internal/llmconfig`, and `internal/mcpx`
   - own live chat-state tracking, cancellation handles, and streaming/event
     interfaces
   - wire a provider-backed managed executor instead of leaving the service
     disabled

2. Stage 2: managed chat hydrate/stop transport
   - add thin Go `getLLMChat` and `stopLLMChat` routes over the completed
     runtime foundation
   - mirror the existing typed not-found, latest-run, live-overlay, and
     stopped-message behaviors

3. Stage 3: managed chat send transport
   - add thin Go `getLLMResponse` transport for `EngineType.setta_llm`
   - keep route-level semantics explicit:
     - section/unscoped validation
     - branch-edit validation
     - `continueFromChatId`
     - frontend-affinity-token propagation
     - permission/search prompt metadata

4. Later follow-ons, if still needed
   - external-agent chat runtime and AI routes
   - transcription session runtime and transport

## Verification Targets

- owner-package Go tests for the new managed chat runtime
- focused `internal/httpapi` tests for send/hydrate/stop route behavior
- targeted reference checks against the existing Python route tests for:
  - chat hydration
  - stop semantics
  - branch-edit and continuation validation
  - frontend-affinity-token normalization

## Open Questions

- whether the first Go managed-chat runtime should persist append-only stream
  event logs or continue using the persisted run shape as the primary durable
  source of truth
  - current recommendation: keep the first slice aligned with the persisted
    run path already owned by `internal/agentruns`
- whether AI-follow and reveal-side integration must land in Stage 1 or can be
  deferred behind the same live-state owner until the frontend proves it is
  blocked
  - current recommendation: defer anything beyond send/hydrate/stop unless a
    concrete frontend regression appears

## Progress Notes

- 2026-03-08: created this Phase 12 plan after re-reading the current Python
  AI/chat routes and runtime against the Go codebase.
- 2026-03-08: confirmed that the packaged CLI and MCP/tooling slices are
  complete, but managed Setta-LLM send/hydrate/stop remains Python-owned in
  `backend/setta/routers/ai.py` and `backend/setta/llm/agent_runner.py`.
- 2026-03-08: bounded the next implementation phase to managed Setta-LLM chat
  only; external-agent chat and transcription remain separate follow-ons.

## Verification

- docs-only planning update; no runtime tests were needed for this new phase doc

## Recommended Next Step

Implement Phase 12 Stage 1 from this doc:

- add the explicit Go managed chat runtime owner
- wire a real provider-backed managed executor
- keep external-agent chat and transcription out of scope until the managed
  Setta-LLM path is owned cleanly
