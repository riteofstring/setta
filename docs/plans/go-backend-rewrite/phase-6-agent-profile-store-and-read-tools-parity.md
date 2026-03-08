# Phase 6 Agent-Profile Store And Read Tools Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`report_completion_status` parity work.

The goal is to land the smallest remaining agentic MCP read surface in Go by
building the file-backed agent-profile store foundation and exposing the
read-only tools above it.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- `report_completion_status` is complete
- the next smallest remaining Python-owned MCP gaps are
  `list_agent_profiles` and `get_agent_profile`
- Go does not yet own any agent-profile store, schema, or read runtime

## Scope

This slice should cover:

- agent-profile file-backed store foundation
- `list_agent_profiles`
- `get_agent_profile`

It should include:

- a bounded Go owner for `agent_profiles.json` read/write path handling and
  validation
- explicit Go models for the read-only subset of `AgentProfile`
- MCP parity in `internal/mcpx`
- focused HTTP tool-route and authenticated SSE coverage
- focused owner tests for empty store, round-trip reads, and missing-profile
  behavior

## Non-Goals

- `run_agent_profile`
- agent-profile create/update/delete routes
- websocket agent-profile broadcast behavior
- agent-profile watcher parity
- engine config, transcription profile, or external agent config migration
- plugin or UI-setting registry work

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `backend/setta/mcp/tools/agentic_tools.py`
- `backend/setta/agentic/store.py`
- `backend/setta/database/db_objs.py`
- `backend/setta/types/agentic.py`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/example_config.py`
- `tests/agentic/test_agentic_store.py`
- `tests/routers/test_agentic_routes.py`
- `internal/mcpx/server.go`
- `internal/httpapi/mcp_routes.go`
- `internal/app/mcp_test.go`

## Current Python Behavior

1. `list_agent_profiles`
   - reads `agent_profiles.json`
   - returns `[]` when the file is missing or empty
   - validates entries as `AgentProfile`

2. `get_agent_profile`
   - loads the same profile list
   - returns the matching profile by id
   - fails when the profile id is missing

3. Store boundary
   - `DBE` owns the `agent_profiles.json` path under the Setta files root
   - writes are JSON arrays
   - example config seeding may populate defaults when the file is absent

## Working Decisions

- build a bounded Go store/read owner first instead of trying to jump directly
  to `run_agent_profile`
- keep the first Go agent-profile model limited to the fields needed by the
  read tools
- keep transport thin and delegate file/path handling and validation to the
  new store owner
- defer create/update/delete and websocket broadcast behavior to later slices

## Dependency Status

New owner needed:

- file-backed agent-profile store with validation for `agent_profiles.json`

Existing Go foundations already available:

- MCP server/session plumbing
- authenticated SSE and MCP tool-route harnesses
- Setta files path resolution and file-backed runtime patterns

## Verification Targets

- owner-package tests
  - missing file returns empty list
  - stored profiles load deterministically
  - missing profile id returns a bounded not-found error
- `internal/mcpx`
  - tool registration and tool-call behavior
- `internal/httpapi`
  - MCP tool-route coverage
- `internal/app`
  - authenticated SSE and tool-route coverage

## Open Questions

- whether default/example agent-profile seeding belongs in this slice or should
  stay deferred until broader agentic runtime migration; current recommendation
  is to keep the initial store owner read-only and return `[]` for a missing
  file unless a concrete product dependency forces default seeding sooner

## Next Recommended Step

- implement this bounded agent-profile store/read slice end-to-end before
  attempting `run_agent_profile`
