# Phase 6 CodeObj Target Mapping, Singleton Fallback, And Suppression

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed first
scoped write-tool pilot.

Go now owns:

- metadata-driven section-target extraction from MCP arguments
- scoped write enforcement for section-targeted tools
- the first scoped write tool:
  - `set_code_section_diagnostics_mute`

What Go still does not own is the richer target-resolution behavior that Python
uses before evaluating scope:

- mapping `codeObj` ids to section targets
- default-singleton fallback when tool metadata declares an implicit singleton
  target
- the next scoped mutation tool that reuses the same diagnostics-ignore owner

## Status

This slice is now complete.

Current repo status as of 2026-03-07:

- `internal/mcpx` resolves section targets from `Metadata.IDPathsByType`
- `internal/mcpx` now also resolves effective scoped targets from:
  - `Metadata.IDPathsByType[codeObj]`
  - `Metadata.DefaultTargetSingletonSection`
- scoped denials can now surface `unmappedCodeObjIds`
- Go now owns both diagnostics-ignore MCP mutation tools:
  - `set_code_section_diagnostics_mute`
  - `set_code_section_diagnostic_code_suppression`

## Scope

This focused slice covers:

- `codeObj` target extraction and invocation-edge temp-id translation from MCP
  arguments
- `codeObj -> section` mapping from the effective project-state view used by
  scope checks
- default-singleton fallback from `Metadata.DefaultTargetSingletonSection`
- explicit denial payloads for unmapped code objects
- one next scoped write tool:
  - `set_code_section_diagnostic_code_suppression`

## Non-Goals

- the first structural/project-shape tool in the same slice
- missing-edge hint parity in the same slice
- broad param-edit MCP parity in the same slice
- UI-setting reveal tools
- BM25/search behavior changes

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-first-scoped-write-tool-and-target-extraction.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/agentic/agentic_scope.py`
- `backend/setta/mcp/id_path_utils.py`
- `backend/setta/mcp/tools/project_state_registry.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/agentic/test_agentic_scope.py`
- `tests/agentic/test_agentic_scope_violation_tool_result.py`
- `internal/projectview/single_config.go`
- `internal/projectstate/code_section_diagnostics_ignore.go`
- `internal/httpapi/lsp_routes.go`

## Dependency Finding

The next useful MCP step is not a structural tool yet.

The highest-leverage missing behavior is richer target resolution ahead of
scope checks, because multiple remaining MCP tools rely on it:

1. param/code-object tools target `codeObj` ids, not only section ids
2. generated/global singleton tools target an implicit section chosen from
   project-state singleton ownership
3. scoped denial payloads need to distinguish unknown code objects from
   blocked sections

`set_code_section_diagnostic_code_suppression` is the best bounded tool to ship
on top of this work because:

- the runtime mutation already exists in Go
- it stays in the same diagnostics-ignore boundary as the completed mute pilot
- it expands the write surface without dragging in structural semantics

## Working Decisions

- build `codeObj` mapping from the effective project-state view
  - use explicit merged section payload data, not keyword heuristics
  - treat `codeObjVariantMap` and `callable` carriers as the source of truth
- keep singleton fallback metadata-driven
  - only use the declared singleton name from tool metadata
  - do not guess from tool names or argument shapes
- keep this slice scoped to one next write tool
  - add `set_code_section_diagnostic_code_suppression`
  - defer param-entry tools until the richer target boundary is stable
- keep transport thin
  - MCP handlers call Go runtime owners directly
  - do not route MCP through REST handlers

## Proposed Go Boundaries

### `internal/mcpx`

Own:

- `codeObj` id extraction and invocation-edge translation
- effective target resolution for:
  - explicit section ids
  - mapped `codeObj` ids
  - default singleton section metadata
- denial payload shaping for unmapped code objects
- registration of the next diagnostics-ignore write tool

Do not own:

- project-state mutation rules
- diagnostics ignore-state storage details

### `internal/projectview`

Remain the source for:

- singleton section identity
- effective section/code-object payload data needed to build target mappings

### `internal/projectstate`

Remain the owner for:

- diagnostics suppression mutation semantics
- persisted snapshot/save lifecycle

## Implementation Steps

1. Extend invocation-edge translation.
   - translate `codeObj` ids from metadata paths, not tool-name branches
   - return translated `unmappedCodeObjIds` in structured failures

2. Extend scope checks.
   - resolve section targets from:
     - explicit section ids
     - mapped `codeObj` ids
     - default singleton fallback
   - distinguish:
     - `unmapped_code_obj`
     - `out_of_scope_and_unmapped_code_obj`

3. Add `set_code_section_diagnostic_code_suppression`.
   - register as a discoverable write tool
   - metadata:
     - `AccessTypeWrite`
     - `IDPathsByType[section] = ["sectionId"]`
   - call the existing Go runtime suppression mutation and diagnostics reapply
     path

4. Cover the slice with focused tests.
   - scope-check tests for `codeObj` mapping and singleton fallback
   - translation tests for `codeObj` temp ids
   - MCP server tests for suppression success/denial
   - HTTP/app integration tests for the expanded tool catalog and suppression
     mutation path

## Acceptance

- MCP argument translation rewrites `codeObj` ids from metadata paths
- scope checks map `codeObj` ids to section targets from effective project-state
  data
- metadata-declared singleton targets resolve without heuristics
- blocked tool results can surface `unmappedCodeObjIds`
- `set_code_section_diagnostic_code_suppression` is callable through Go MCP
  transports

## Completed

- added `internal/mcpx/target_resolution.go`
  - effective target resolution over:
    - explicit section ids
    - mapped `codeObj` ids
    - metadata-declared singleton fallback
  - source-of-truth `codeObj -> section` mapping from effective section payloads
    and singleton ownership in `projectview.SingleConfig`
- updated `internal/mcpx/agentic_context.go`
  - scope checks now resolve `codeObj` carriers and singleton targets before
    allow/deny evaluation
  - denied results can now distinguish:
    - `unmapped_code_obj`
    - `out_of_scope_and_unmapped_code_obj`
  - structured failures now include sorted `unmappedCodeObjIds`
- updated `internal/mcpx/translation.go`
  - invocation-edge temp-id translation now rewrites `codeObj` ids from
    metadata paths
  - structured failures now translate `unmappedCodeObjIds` back to temporary
    ids
- added the next scoped write tool in `internal/mcpx/server.go`
  - `set_code_section_diagnostic_code_suppression`
  - discoverable write tool using the existing Go diagnostics-ignore runtime
    and reapply path
- expanded focused coverage in:
  - `internal/mcpx/agentic_context_test.go`
  - `internal/mcpx/translation_test.go`
  - `internal/mcpx/server_test.go`
  - `internal/httpapi/mcp_tool_routes_test.go`
  - `internal/app/mcp_test.go`

## Decisions

- keep `codeObj` mapping view-derived and explicit
  - target resolution reads effective section payload data and singleton state
    from `projectview.SingleConfig`
  - no tool-name heuristics or best-effort fallback matching were added
- keep singleton fallback metadata-driven
  - only the declared `DefaultTargetSingletonSection` is considered
  - no implicit singleton lookup was added for tools without that metadata
- extend the existing diagnostics-ignore boundary before moving to broader
  write/structural parity
  - `set_code_section_diagnostic_code_suppression` reuses already-migrated Go
    runtime semantics instead of opening a new subsystem in the same slice

## Open Questions

- none at this slice boundary

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute|TestRegisterLSPRoutesMutesCodeSectionDiagnostics' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Recommended Follow-On

- Slice 7 is complete.
- Follow-on code-object write slices for `set_param_entered_value`,
  `set_type_error_ignore`, `set_code_obj_display_name`, and
  `set_code_obj_name` are now complete.
- `set_param_name_and_value` is now complete over the combined rename/value
  boundary.
- Structural/project-shape follow-ons through `create_new_section_variant` are
  now complete.
- `set_callable` is now complete over the Go-owned callable/signature-help
  boundary.
- The next recommended step is a focused `add_kwarg` slice so new param
  creation lands on the completed callable selection and combined rename/value
  boundaries.
- Keep broader structural move/reparent semantics deferred until a dedicated
  structural plan narrows them into a bounded owner.
