# Phase 6 Auto Layout Top-Level Sections Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_top_level_section_layout` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `auto_layout_top_level_sections`.

Go already owns the runtime mutation, settings-backed sizing-policy lookup, and
IDE HTTP route for top-level auto layout. The remaining gap is MCP parity over
that completed owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `set_top_level_section_layout` MCP parity is complete
- Go already owns top-level auto layout in:
  - `internal/projectstate/auto_layout.go`
  - `internal/httpapi/project_routes.go`
- MCP server wiring already has the settings-runtime provider needed by this
  slice
- the remaining work is MCP registration plus structural-scope, invalid-margin,
  and authenticated transport coverage

## Scope

This focused slice covers:

- a Go MCP `auto_layout_top_level_sections` structural tool
- reuse of the existing Go `AutoLayoutTopLevelSections(...)` runtime owner
- settings-runtime snapshot reuse through the existing MCP server wiring
- optional `margin` input with the same default `50` used by Python and the Go
  IDE route
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - structural-scope rejection for scoped chats
  - unscoped structural success
  - invalid margin rejection
  - temporary-id translation for `projectConfigId`

## Non-Goals

- changing the packing algorithm or sizing-policy lookup
- section-targeted scoped auto-layout behavior
- `set_top_level_section_layout`
- `set_section_sizes`
- moving auto-layout into share/deployment policy transport
- batching auto-layout with other layout mutations

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-4-auto-layout-top-level-sections.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `tests/types/test_section_sizing_normalization.py`
- `tests/routers/test_share_policy_routes.py`
- `internal/projectstate/auto_layout.go`
- `internal/projectstate/auto_layout_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python `BaseProjectManager.auto_layout_top_level_sections(...)`:

1. resolves the single-config project state
2. delegates to the shared `auto_layout_top_level_sections(...)` helper
3. uses `margin=50` by default through the request model
4. tags the tool as `access_type="structural"`
5. broadcasts the refreshed project state after the mutation

The Go rewrite already owns the layout algorithm and runtime mutation through
`internal/projectstate.Runtime.AutoLayoutTopLevelSections(...)`.

## Working Decisions

- keep MCP transport thin
  - the tool should validate arguments, enforce scope, and delegate to the
    existing Go runtime owner
- keep this tool `structural`
  - unlike `set_top_level_section_layout`, this mutation rewrites the full
    top-level layout set for the active view mode
  - there is no bounded caller-supplied section target list that would make the
    scoped write boundary honest
  - scoped chats should therefore fail closed unless they opt into unscoped
    structural access
- keep margin defaulting transport-level and validation runtime-authored
  - MCP should default omitted `margin` to `50`
  - negative margins should still be rejected by the existing runtime owner so
    error semantics stay source-of-truth driven
- reuse the existing settings-runtime snapshot pathway
  - do not add MCP-local settings traversal or duplicate policy resolution
- keep the output simple
  - return `{ status: "ok" }`
- keep temporary-id handling narrow
  - only `projectConfigId` needs invocation-edge translation in this slice
  - there are no section arguments or result ids to translate

## Implementation Outline

1. Register the `auto_layout_top_level_sections` MCP tool.
   - `accessType: structural`
   - input: `projectConfigId`, optional `margin`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read optional integer `margin`, defaulting to `50`
   - load `settingsState.Snapshot().Document`
   - delegate to `projectState.AutoLayoutTopLevelSections(...)`

3. Reuse existing mutation error mapping.
   - preserve current project-not-found handling
   - normalize invalid auto-layout and settings-value failures as structured
     `invalid_arguments` MCP errors
   - avoid MCP-local packing or sizing-policy rules

4. Add focused tests.
   - MCP server metadata and tool-count coverage
   - structural deny/allow behavior
   - invalid margin mapping
   - temporary-id project id translation
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- pending implementation

## Open Questions

- none at slice start

## Next Recommended Step

- implement this slice before widening into the smaller layout/presentation
  MCP tools
- after this slice, the next likely bounded work is one of:
  - `set_show_param_display_names`
  - `toggle_position_locks`
  - `toggle_minimized`

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `auto_layout_top_level_sections`.
