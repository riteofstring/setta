# Phase 6 Set Section Tag Color Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`toggle_minimized` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `set_section_tag_color`.

Go already owns the runtime mutation and IDE HTTP route for this single-section
layout-presentation write. The remaining gap is MCP parity over that existing
owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `toggle_minimized` MCP parity is complete
- `set_section_tag_color` is the next bounded slice
- Go already owns `set_section_tag_color` in:
  - `internal/projectstate/layout_presentation.go`
  - `internal/httpapi/project_routes.go`
- Python tags `set_section_tag_color` as a write project-state tool with
  explicit `sectionId` argument targeting metadata

## Scope

This focused slice covers:

- a Go MCP `set_section_tag_color` write tool
- reuse of the existing Go `SetSectionTagColor(...)` runtime owner
- `sectionId` argument targeting metadata for scoped denial reporting and
  temporary-id translation
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - scoped write rejection for out-of-scope sections
  - scoped write success
  - not-found handling for unknown sections
  - temporary-id translation for `projectConfigId` and `sectionId`
  - clearing the tag color with `null`

## Non-Goals

- `toggle_minimized`
- `set_section_style_color`
- any broader layout-presentation MCP bundle
- compare-and-set behavior
- changing the runtime's section-field mutation semantics

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/section-colors.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/routers/project_manager.py`
- `internal/projectstate/layout_presentation.go`
- `internal/projectstate/layout_presentation_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/mcpx/server.go`
- `internal/mcpx/agentic_context.go`

## Current Python Behavior

Python `BaseProjectManager.set_section_tag_color(...)`:

1. records a coalesced history entry keyed by project and section
2. resolves the single-config project state
3. sets or clears `tagColor` for the requested section
4. tags the tool as `access_type="write"`
5. exposes `sectionId` as section-targeting metadata for agentic tooling
6. persists and broadcasts through the standard no-name-validation update path

The Go runtime already owns the same section-field mutation through
`internal/projectstate.Runtime.SetSectionTagColor(...)`.

## Working Decisions

- keep MCP transport thin
  - the tool should validate arguments, enforce scope, and delegate to the
    existing Go runtime owner
- keep this tool `write`
  - Python already treats it as a write mutation rather than a structural one
- keep `sectionId` in MCP metadata
  - the section-id path drives scoped-write target extraction and temporary-id
    translation
- keep runtime-owned validation
  - unknown sections should continue to fail through the runtime owner rather
    than through an MCP-local precheck
- preserve explicit clear semantics
  - `tagColor: null` should clear the field rather than inventing a sentinel
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Register the `set_section_tag_color` MCP tool.
   - `accessType: write`
   - `idPathsByType.section = ["sectionId"]`
   - input: `projectConfigId`, `sectionId`, `tagColor`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read required `sectionId`
   - read optional `tagColor`
   - validate scoped write access
   - delegate to `projectState.SetSectionTagColor(...)`

3. Add focused tests.
   - MCP server metadata and tool-count coverage
   - scoped write denial behavior
   - scoped write success
   - unknown-section error mapping
   - temporary-id translation for project and section ids
   - `null` clears the persisted tag color
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsSetSectionTagColor|TestMCPToolCallRouteSetSectionTagColorAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsSetSectionTagColorOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForSetSectionTagColorOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsSetSectionTagColor' -count=1 -timeout 420s`

## Open Questions

- none at slice start

## Next Recommended Step

- keep `set_section_style_color` as the next nearby layout-presentation MCP
  slice after this one
- keep `set_watch_code_enabled` as the next non-presentation follow-on with an
  existing Go owner

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `set_section_tag_color`.
