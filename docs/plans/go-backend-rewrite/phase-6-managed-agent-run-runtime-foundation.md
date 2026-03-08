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
- Go now owns the bounded managed agent-run foundation in
  `internal/llmconfig` and `internal/agentruns`
- `run_agent_profile` remains the next missing agentic MCP tool, but it is no
  longer blocked on missing file-backed stores or runtime service boundaries
- the new managed-run service is currently wired with an explicit executor
  boundary and no default provider adapter yet

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

## Decisions Landed

- `internal/llmconfig` is now the bounded Go owner for managed-run
  `llm_config.json` semantics, including strict config-id derivation,
  MCP-server reference validation, request-parameter derivation, and
  workspace `.env` API-key filtering
- `internal/agentruns.EngineStore` is now the bounded Go owner for
  `engine_configs.json`
- `internal/agentruns.RunStore` is now the bounded Go owner for persisted
  `agent_runs/` and `agent_run_index.json`
- `internal/agentruns.Service` is now the explicit managed-run runtime
  boundary above those stores, including project-context validation,
  temporary-id-aware system-prompt assembly, run lifecycle persistence, and a
  pluggable executor interface
- `internal/app.App` now wires that foundation in IDE mode so later transport
  slices can depend on a concrete runtime owner instead of rebuilding startup
  state ad hoc
- the first foundation slice intentionally stops at an explicit executor
  boundary; no default provider-backed executor is wired yet

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

This slice is now complete.

Completed owners in this slice:

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
- whether the first provider-backed executor should land inside the
  `run_agent_profile` slice or as a separate follow-on adapter slice if the
  transport can otherwise ship cleanly; current recommendation is to keep the
  transport slice thin and only broaden further if the disabled executor
  boundary proves insufficient

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/llmconfig -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/agentruns -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/llmconfig ./internal/agentruns ./internal/mcpx ./internal/app -run 'Test(LoadDefaultsToSettaServerWhenFileMissing|LoadDerivesConfigIDsAndResolvesServerSets|SaveStripsTemporaryConfigsAndEmbeddedIDs|BuildRequestParamsAndRuntimeAPIKeys|ReadEnvFileAndRuntimeFiltersConfiguredKeysOnly|EngineStoreRoundTripAndResolveManagedEngine|RunStorePersistsRunsAndMetadataIndex|ServiceRunSubAgentPersistsLifecycleAndCompletes|ServiceRunSubAgentMarksRunFailedWhenExecutorFails|ServiceRejectsDisabledExecutorAndMissingProfileEngine|BuildSystemPromptUsesTemporaryProjectID|AppWiresManagedAgentRunFoundationInIDEMode)' -count=1 -timeout 420s`

## Progress Notes

- 2026-03-08: added `internal/llmconfig` as the first explicit Go owner for
  managed-run `llm_config.json` semantics plus runtime API-key filtering from
  workspace `.env`.
- 2026-03-08: added `internal/agentruns.EngineStore` and
  `internal/agentruns.RunStore` for `engine_configs.json`, `agent_runs/`, and
  `agent_run_index.json`.
- 2026-03-08: added `internal/agentruns.Service` as the managed-run runtime
  boundary, including project-context validation, lifecycle persistence,
  snapshot events, and an injected executor interface.
- 2026-03-08: wired the managed-run foundation into `internal/app.App` for IDE
  mode without adding transport or provider-executor wiring in this slice.

## Next Recommended Step

- treat the managed-agent-run foundation as complete and continue with
  `phase-6-ui-setting-registry-and-reveal-tools-parity.md`
