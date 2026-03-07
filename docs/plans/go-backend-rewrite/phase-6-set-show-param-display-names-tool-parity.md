# Phase 6 Set Show Param Display Names Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`auto_layout_top_level_sections` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `set_show_param_display_names`.

Go already owns the runtime mutation and IDE HTTP route for this project-wide
layout-presentation toggle. The remaining gap is MCP parity over that existing
owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `auto_layout_top_level_sections` MCP parity is complete
- Go already owns `set_show_param_display_names` in:
  - `internal/projectstate/layout_presentation.go`
  - `internal/httpapi/project_routes.go`
- Python continues to tag `set_show_param_display_names` as a structural
  project-state tool
- the remaining work is MCP registration plus structural-scope and authenticated
  transport coverage

## Scope

This focused slice covers:

- a Go MCP `set_show_param_display_names` structural tool
- reuse of the existing Go `SetShowParamDisplayNames(...)` runtime owner
- required `showParamDisplayNames` boolean input over the existing project-level
  mutation
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - structural-scope rejection for scoped chats
  - unscoped structural success
  - temporary-id translation for `projectConfigId`

## Non-Goals

- `compare_and_set_show_param_display_names`
- `toggle_position_locks`
- `toggle_minimized`
- any broader layout-presentation MCP bundle
- adding MCP-local compare-and-set or reveal-lease behavior
- changing persistence semantics or project-state broadcast ownership

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `tests/project_state/test_ui_setting_reveal_leases.py`
- `tests/project_state/test_code_file_binding_registration.py`
- `tests/routers/test_share_deployments.py`
- `internal/projectstate/layout_presentation.go`
- `internal/projectstate/layout_presentation_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python `BaseProjectManager.set_show_param_display_names(...)`:

1. resolves the single-config project state
2. mutates `projectConfig.showParamDisplayNames`
3. tags the tool as `access_type="structural"`
4. delegates persistence and broadcast through the existing project-state update
   path

Python also has a separate `compare_and_set_show_param_display_names(...)`
tool, but that is a different slice and should not be bundled into this one.

## Working Decisions

- keep MCP transport thin
  - the tool should validate arguments, enforce scope, and delegate to the
    existing Go runtime owner
- keep this tool `structural`
  - the mutation changes a project-wide presentation toggle rather than a
    bounded section target
  - there is no honest section-scoped write surface for this tool
  - scoped chats should therefore fail closed unless they opt into unscoped
    structural access
- keep the input surface minimal
  - require `projectConfigId`
  - require `showParamDisplayNames`
  - do not add compare-and-set arguments or hidden frontend-only fields
- keep temporary-id handling narrow
  - only `projectConfigId` needs invocation-edge translation in this slice
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Register the `set_show_param_display_names` MCP tool.
   - `accessType: structural`
   - input: `projectConfigId`, `showParamDisplayNames`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read required `showParamDisplayNames`
   - validate unscoped structural access
   - delegate to `projectState.SetShowParamDisplayNames(...)`

3. Add focused tests.
   - MCP server metadata and tool-count coverage
   - structural deny behavior
   - unscoped success
   - temporary-id project id translation
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- pending implementation

## Open Questions

- none at slice start

## Next Recommended Step

- implement this slice before widening into the remaining section-targeted
  layout-presentation MCP tools
- after this slice, the next likely bounded work is:
  - `toggle_position_locks`
  - `toggle_minimized`

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `set_show_param_display_names`.
