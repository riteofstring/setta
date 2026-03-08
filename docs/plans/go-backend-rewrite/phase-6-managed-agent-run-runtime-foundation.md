# Phase 6 Managed Agent-Run Runtime Foundation

## Purpose

This doc scopes the prerequisite Phase 6 slice that must land before
Go-owned `run_agent_profile` parity can be implemented cleanly.

The goal is to build the bounded managed agent-run foundation in Go without
broadening into chat-route migration, external-agent parity, or plugin
management.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- `list_agent_profiles` and `get_agent_profile` are complete in Go
- `run_agent_profile` remains the next missing agentic MCP tool, but direct
  implementation is blocked on missing Go runtime owners
- Go does not yet own managed `agent_runs/` persistence, engine-config
  resolution, full `llm_config.json` semantics, or a managed LLM execution
  service

## Scope

This slice should cover:

- explicit Go owner for persisted managed agent runs under `setta_files`
- bounded engine-config store/read and managed-engine resolution required by
  agent profiles
- full Go owner for the persisted `llm_config.json` semantics needed by
  managed runs, beyond MCP-server config parsing
- runtime API-key snapshot/update ownership for managed LLM execution
- minimal non-streaming managed-run service boundary that `run_agent_profile`
  can call later

It should include:

- a bounded Go store for `agent_runs/` plus the metadata/index data needed to
  load saved runs deterministically
- a bounded Go store for `engine_configs.json` and managed-engine resolution
  for `EngineType.setta_llm`
- a Go owner for `llm_config.json` that validates config ids, default config
  selection, MCP-server references, and request-parameter derivation for
  managed runs
- explicit runtime wiring for managed API-key snapshots instead of embedding
  `.env` access inside transport handlers
- focused owner tests for missing config, missing engine, run persistence,
  and managed-run lifecycle state

## Non-Goals

- `run_agent_profile` MCP, HTTP, or SSE transport wiring
- chat-run route migration
- websocket stream fanout, AI-follow updates, or reveal flows
- external-agent runner parity
- plugin management, UI-setting registry, or app-definition patch streaming
- transcription-profile migration
- agent-profile create/update/delete routes

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/plans/go-backend-rewrite/phase-6-run-agent-profile-tool-parity.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tools/agentic_tools.py`
- `backend/setta/llm/agent_runner.py`
- `backend/setta/agentic/store.py`
- `backend/setta/agentic/engine_resolver.py`
- `backend/setta/agentic/system_prompt.py`
- `backend/setta/llm/config.py`
- `backend/setta/llm/config_watcher.py`
- `backend/setta/types/llm_config.py`
- `backend/setta/server_state.py`
- `tests/llm/test_agent_runner.py`
- `internal/mcpx/config.go`
- `internal/agentprofiles/store.go`
- `go.mod`

## Current Python Behavior

1. Startup/runtime wiring
   - `server_state.py` loads `llm_config.json`, constructs `MultiMCPClient`
     plus `AgentRunner`, syncs API keys from `.env`, and starts the
     `LLMConfigWatcher`

2. Managed run persistence
   - `agentic.store` owns `agent_runs/`, the run index, engine configs, and
     create/save/load/list helpers for persisted managed runs

3. Engine and LLM config resolution
   - `engine_resolver.py` loads the engine config, selects the effective LLM
     config, and rejects missing config dependencies explicitly
   - `llm/config.py` and `types/llm_config.py` own `llm_config.json`
     validation, default-config selection, MCP-server references, and request
     parameter derivation

4. Managed sub-agent execution prerequisites
   - `system_prompt.py` injects project/profile context and temporary-id
     mapping into the managed system prompt
   - `AgentRunner.run_sub_agent` persists the run, records `run_started` and
     `snapshot`, executes the managed run to completion, and returns the final
     persisted `AgentRun`

## Current Go Gap

- `internal/mcpx/config.go` only owns the MCP-server subset of
  `llm_config.json` for internal MCP-client setup
- there is no Go-owned `internal/llm` or equivalent managed provider runtime
- there is no Go-owned persisted `agent_runs` or `engine_configs` store
- there is no Go-owned API-key sync boundary for managed LLM execution
- there is no Go-owned managed system-prompt or run-event owner

## Working Decisions

- split this foundation out from `run_agent_profile` transport instead of
  hiding the prerequisite inside an MCP handler
- keep the first Go managed-run foundation limited to `EngineType.setta_llm`
  instead of broadening into external-agent execution
- use explicit Go service boundaries for config store, run store, provider
  adapter, and managed-run orchestration
- persist canonical run data before adding transport parity on top
- do not route managed runs back through Python or shell out to arbitrary
  interpreters

## Dependency Status

Already complete:

- file-backed agent-profile store/read owner
- unscoped MCP read transport for agent profiles
- internal MCP client/runtime-status foundation

New owners needed in this slice:

- persisted managed `agent_runs` owner
- persisted `engine_configs` owner and resolver
- full `llm_config.json` owner for managed-run semantics
- managed API-key snapshot/update boundary
- minimal non-streaming managed-run service

## Verification Targets

- owner-package tests
  - `llm_config.json` load/save/default resolution works without transport code
  - missing engine configs or missing LLM configs fail cleanly
  - managed runs persist and reload deterministically
  - managed run lifecycle records `run_started`, `snapshot`, and terminal
    state
- integration-level runtime tests
  - app/runtime wiring can construct the managed-run foundation without MCP
    transport handlers

## Open Questions

- whether the first Go managed-run foundation should persist run events as
  separate append-only files or continue using the persisted `AgentRun` shape
  as the primary source of truth; current recommendation is to keep the first
  slice aligned with the persisted `AgentRun` path already exercised by the
  bounded Python tests and defer transport-specific event fanout

## Next Recommended Step

- implement this foundation slice before attempting
  `phase-6-run-agent-profile-tool-parity.md`
