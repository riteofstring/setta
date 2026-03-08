# Phase 6 Run Agent Profile Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
agent-profile store/read work.

The goal is to land Go-owned `run_agent_profile` parity without broadening into
full chat-run, external-agent, or plugin-management migration.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- `list_agent_profiles` and `get_agent_profile` are complete in Go
- `run_agent_profile` is now the next remaining agentic MCP gap
- Go still does not own the managed agent-run runtime behind this tool

## Scope

This slice should cover:

- Go-owned `run_agent_profile`
- the minimal managed sub-agent runtime it requires
- bounded persisted agent-run ownership needed to return final `AgentRun`
  payloads cleanly

It should include:

- explicit Go owner for persisted agent-run records under `setta_files`
- bounded engine-config and project-context resolution needed for sub-agent
  runs
- non-streaming managed run execution for agent-profile-driven tool calls
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

- keep this slice focused on managed sub-agent completion, not chat streaming
- reuse the completed agent-profile store rather than reopening storage design
- prefer an explicit Go runtime boundary for managed runs over embedding LLM
  orchestration details inside MCP handlers
- keep the first Go run owner limited to the persistence and lifecycle needed
  by `run_agent_profile`
- defer AI-follow, websocket fanout, and richer run-management APIs until a
  concrete dependency requires them

## Dependency Status

Already complete:

- file-backed agent-profile store/read owner
- unscoped MCP read transport for agent profiles
- Setta-files path ownership patterns and MCP transport harnesses

New owner needed:

- managed agent-run runtime for non-streaming sub-agent execution
- bounded persisted agent-run owner for create/save/load
- engine-config and project-context resolution for agent-profile execution

## Verification Targets

- owner/runtime-package tests
  - starting a managed sub-agent run persists a run record
  - completed runs record `run_started`, `snapshot`, and completion state
  - missing profiles or disabled runtime fail cleanly
- `internal/mcpx`
  - tool registration and tool-call behavior
- `internal/httpapi`
  - MCP tool-route coverage
- `internal/app`
  - authenticated SSE and tool-route coverage

## Open Questions

- whether the first Go `run_agent_profile` slice should return a minimal final
  run payload only, or also lay the groundwork for later stop/list/get run
  transport; current recommendation is to keep the first slice minimal and only
  add the persistence surface required by this tool

## Next Recommended Step

- implement this bounded managed sub-agent run slice before moving on to the
  broader UI-setting registry or plugin-management gaps
