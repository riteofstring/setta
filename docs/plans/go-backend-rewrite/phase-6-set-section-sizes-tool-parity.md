# Phase 6 Set Section Sizes Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_code_section_attached_terminal` work.

The highest-leverage remaining MCP mutation gap is now:

- `set_section_sizes`

This slice is larger than the attached-terminal transport gap, so it needs a
fresh implementation-plan doc before code work starts.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- `set_code_section_attached_terminal` is complete across the runtime, MCP
  server, route bridge, and authenticated SSE transport
- Go already owns several sizing foundations that `set_section_sizes` should
  reuse instead of duplicating:
  - settings-backed `SectionSizingPolicy` resolution in `internal/projectstate/auto_layout.go`
  - payload size parsing in `payloadAutoLayoutSizeValue`
  - child-creation size normalization in `internal/projectstate/child_section_creation.go`
  - attached-terminal size normalization in
    `internal/projectstate/attached_terminal_writes.go`
- Go does not yet own a general runtime mutation for resizing existing
  sections, and MCP still has no `set_section_sizes` tool

## Scope

This focused slice should cover:

- a Go runtime owner for `set_section_sizes`
- settings-backed normalization of incoming width/height payloads against min
  and max policy bounds
- rejection of non-finite values
- persistence of normalized size payloads for multiple target sections in one
  mutation
- attached-terminal lockstep width behavior when resizing code sections or
  their embedded terminals
- Go MCP parity for `set_section_sizes`
- focused tests for:
  - policy clamping
  - auto-size preservation
  - non-finite rejection
  - embedded code/terminal width synchronization
  - temp-id translation and structural routing

## Non-Goals

- generic move-sections parity
- frontend drag interaction mechanics or snap-to-grid behavior
- section-variant switching or ordering
- group orientation / overflow transport
- app-definition MCP work

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/reference/section-sizing-and-ux.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/types/test_section_sizing_normalization.py`
- `internal/projectstate/auto_layout.go`
- `internal/projectstate/child_section_creation.go`
- `internal/projectstate/attached_terminal_writes.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python `set_section_sizes`:

1. accepts a section-id keyed map of `SectionSize` values
2. normalizes each payload against `SectionSizingPolicy`
3. preserves `"auto"` where the dimension/mode allows it
4. clamps numeric values to per-type min/max bounds
5. rejects non-finite values
6. persists the normalized size on the effective section impl

The resize UX doc adds one important product rule beyond the narrow helper:

- embedded attached terminals and their code parents must keep width in
  lockstep

## Working Decisions

- keep section size on the section impl payload as the primary source of truth
  - do not make top-level layout `w/h` the authoritative storage path
- extract a reusable Go size-normalization helper
  - child creation, attached-terminal attachment, auto layout, and
    `set_section_sizes` should converge on one normalization path where
    practical
- treat embedded code/terminal width sync as part of this slice
  - that contract is documented product behavior, not a later polish item
- keep MCP transport thin
  - the tool should parse arguments, load the settings snapshot, and delegate

## Implementation Outline

1. Add the runtime owner.
   - accept a section-id keyed size map
   - normalize each section size against settings policy
   - persist normalized payload size values

2. Reconcile attached-terminal sizing rules.
   - resizing a code section width should update its embedded terminal width
   - resizing an embedded attached terminal width should update the code parent
     width
   - preserve the existing embedded minimum-height rules owned elsewhere

3. Add MCP parity.
   - structural access
   - project-scoped invocation
   - temp-id translation for all targeted section ids

4. Add focused tests.
   - runtime normalization and rejection coverage
   - MCP server + route + SSE coverage

## Open Questions

- whether the first Go owner should also mirror normalized sizes into
  top-level layout `w/h` for the active view mode
  - recommendation: keep section impl payload size authoritative first and only
    add layout mirroring if current frontend source proves it is still needed

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test.*(SectionSize|SetSectionSizes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(SetSectionSizes|ListsToolsAndScopesToolCalls)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SetSectionSizes|SupportsSetSectionSizes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsSetSectionSizes|ToolCallRouteSupportsSetSectionSizes)' -count=1 -timeout 420s`

## Next Recommended Step

- implement the `set_section_sizes` runtime owner first in
  `internal/projectstate`
- keep the first code chunk bounded to normalization + attached-terminal width
  synchronization before adding MCP transport

## Progress Notes

- 2026-03-07: doc created immediately after the completed
  `set_code_section_attached_terminal` slice reranked the remaining Phase 6
  mutation gaps.
- 2026-03-07: Go now owns the runtime/document/project `set_section_sizes`
  mutation with shared settings-backed min/max normalization, `"auto"`
  preservation, non-finite rejection, and embedded code/terminal width
  lockstep plus code-height enforcement. MCP transport and bridge coverage are
  still pending.
