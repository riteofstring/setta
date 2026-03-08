# Phase 6 Run Agent Profile Tool Parity

## Purpose

This doc scopes the follow-on Phase 6 slice after the managed agent-run
foundation is in place.

The goal is to land Go-owned `run_agent_profile` parity over the completed
agent-profile store/read work and the completed managed agent-run runtime
foundation, without broadening into full chat-run, external-agent, or
plugin-management migration.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- `list_agent_profiles` and `get_agent_profile` are complete in Go
- `run_agent_profile` is still the next remaining agentic MCP tool
- `phase-6-managed-agent-run-runtime-foundation.md` is now complete
- Go now owns the managed agent-run stores, config/runtime boundary, and
  service boundary behind this tool
- the managed-run service currently exposes an explicit disabled state until a
  provider-backed executor is wired

## Scope

This slice should cover:

- Go-owned `run_agent_profile`
- bounded profile lookup and preflight validation over completed stores
- final managed-run start/wait/load behavior over the completed runtime
  foundation

It should include:

- thin delegation from the MCP tool into the completed managed-run service
- clean error handling for missing profiles, unavailable runtime wiring, and
  managed-run failures
- MCP parity in `internal/mcpx`
- focused HTTP tool-route and authenticated SSE coverage

## Non-Goals

- chat-run route migration
- streaming assistant output over websocket or SSE
- AI-follow updates or reveal flows
- external-agent runner parity
- agent-profile create/update/delete routes
- run stop/list/get routes beyond what the bounded runtime owner needs
- plugin-management, UI-setting registry, or app-patch streaming work

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-managed-agent-run-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-agent-profile-store-and-read-tools-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `backend/setta/mcp/tools/agentic_tools.py`
- `backend/setta/llm/agent_runner.py`
- `backend/setta/agentic/store.py`
- `backend/setta/agentic/engine_resolver.py`
- `backend/setta/agentic/system_prompt.py`
- `backend/setta/server_state.py`
- `tests/llm/test_agent_runner.py`
- `tests/routers/test_agentic_routes.py`
- `internal/mcpx/server.go`
- `internal/agentprofiles/store.go`

## Current Python Behavior

1. `run_agent_profile`
   - loads the requested profile from `agent_profiles.json`
   - fails when the profile id is missing
   - fails when the managed `AgentRunner` is disabled
   - calls `AgentRunner.run_sub_agent(profile, inputs)`

2. `AgentRunner.run_sub_agent`
   - builds a managed run context from the profile plus input payload
   - resolves engine config, project config, chat id, and agentic scope
   - persists the run before execution
   - records `run_started` and `snapshot` events
   - executes the run to completion without stream or AI-follow emission
   - returns the final persisted `AgentRun`

3. Persisted run shape
   - Python stores runs under `agent_runs/`
   - run persistence is reused by other agentic routes, but
     `run_sub_agent` itself only needs create/save/load semantics

## Working Decisions

- keep this slice transport-thin and delegate run persistence plus managed LLM
  execution to the completed foundation owners
- reuse the completed agent-profile store rather than reopening storage design
- keep the first Go `run_agent_profile` tool limited to returning the final
  persisted `AgentRun`
- defer AI-follow, websocket fanout, and richer run-management APIs until a
  concrete dependency requires them

## Dependency Status

Already complete:

- file-backed agent-profile store/read owner
- unscoped MCP read transport for agent profiles
- Setta-files path ownership patterns and MCP transport harnesses
- `phase-6-managed-agent-run-runtime-foundation.md`

## Verification Targets

- `internal/mcpx`
  - tool registration and tool-call behavior
- `internal/httpapi`
  - MCP tool-route coverage
- `internal/app`
  - authenticated SSE and tool-route coverage

## Open Questions

- whether the first Go `run_agent_profile` slice should keep tool-level errors
  mapped directly from the completed managed-run service or introduce
  additional MCP-specific error shaping; current recommendation is to keep the
  first transport thin and reuse the foundation's explicit runtime errors

## Next Recommended Step

- land this transport slice now
