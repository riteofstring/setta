# Phase 6 Set Section Style Color Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_section_tag_color` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `set_section_style_color`.

Go already owns the runtime mutation and IDE HTTP route for this single-section
layout-presentation write. The remaining gap is MCP parity over that existing
owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `set_section_tag_color` MCP parity is complete
- `set_section_style_color` MCP parity is now complete
- Go already owns `set_section_style_color` in:
  - `internal/projectstate/layout_presentation.go`
  - `internal/httpapi/project_routes.go`
- Python tags `set_section_style_color` as a write project-state tool with
  explicit `sectionId` argument targeting metadata
- scoped write, temporary-id, authenticated HTTP bridge, and IDE SSE coverage
  landed in the completed slice

## Scope

This focused slice covers:

- a Go MCP `set_section_style_color` write tool
- reuse of the existing Go `SetSectionStyleColor(...)` runtime owner
- `sectionId` argument targeting metadata for scoped denial reporting and
  temporary-id translation
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - scoped write rejection for out-of-scope sections
  - scoped write success
  - temporary-id translation for `projectConfigId` and `sectionId`
  - clearing the style color with `null`
  - missing-target ids failing closed at the scoped write boundary

## Non-Goals

- `set_section_tag_color`
- `set_watch_code_enabled`
- any broader layout-presentation MCP bundle
- compare-and-set behavior
- changing the runtime's section-field mutation semantics

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-remaining-mcp-mutation-gap-inventory.md`
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

Python `BaseProjectManager.set_section_style_color(...)`:

1. records a coalesced history entry keyed by project and section
2. resolves the single-config project state
3. sets or clears `styleColor` for the requested section
4. tags the tool as `access_type="write"`
5. exposes `sectionId` as section-targeting metadata for agentic tooling
6. persists and broadcasts through the standard no-name-validation update path

The Go runtime already owns the same section-field mutation through
`internal/projectstate.Runtime.SetSectionStyleColor(...)`.

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
  - do not add MCP-local prechecks for unknown sections just to force a
    different error shape
  - for scoped writes, missing section ids outside the visible project view
    should continue to fail closed at the scope boundary first
- preserve explicit clear semantics
  - `styleColor: null` should clear the field rather than inventing a sentinel
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Register the `set_section_style_color` MCP tool.
   - `accessType: write`
   - `idPathsByType.section = ["sectionId"]`
   - input: `projectConfigId`, `sectionId`, `styleColor`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read required `sectionId`
   - read optional `styleColor`
   - validate scoped write access
   - delegate to `projectState.SetSectionStyleColor(...)`

3. Add focused tests.
   - MCP server metadata and tool-count coverage
   - scoped write denial behavior
   - scoped write success
   - temporary-id translation for project and section ids
   - `null` clears the persisted style color
   - missing-target ids fail closed at the scoped write boundary
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsSetSectionStyleColor|TestMCPToolCallRouteSetSectionStyleColorAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsSetSectionStyleColorOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForSetSectionStyleColorOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsSetSectionStyleColor|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient' -count=1 -timeout 420s`

## Open Questions

- none at slice start
- none after implementation

## Next Recommended Step

- move to `set_watch_code_enabled` as the next bounded Go-owned mutation slice
  after the section-color pair
- keep `set_watch_code_inputs` as the nearby follow-on after that

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `set_section_style_color`.
- 2026-03-07: MCP now exposes `set_section_style_color` as a scoped write tool
  over the existing Go layout-presentation runtime owner.
- 2026-03-07: the slice preserved `sectionId` targeting metadata so scoped
  denials and temporary-id translation remain source-of-truth driven at the
  MCP invocation edge.
- 2026-03-07: `styleColor: null` now clears the persisted field through the
  same Go runtime owner used by the IDE HTTP route.
- 2026-03-07: missing section ids for this scoped write fail closed at the
  scope boundary before reaching the runtime owner; no MCP-local fallback or
  compatibility shim was added.
