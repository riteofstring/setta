# Phase 6 First Scoped Write Tool And Target Extraction

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
invocation-edge temp-id translation and scoped diagnostics work.

Go now owns:

- scoped MCP invocation with agentic context
- temp/canonical id translation at the MCP edge
- filtered read tools for project summary and LSP diagnostics

What Go still does not own is the first real scoped mutation boundary that
proves Setta's write access rules over explicit target ids instead of the
current read/no-target shortcut.

## Status

Current repo status as of 2026-03-07:

- `internal/mcpx` can resolve scope and translate ids
- `internal/tools.Metadata` already carries:
  - `AccessType`
  - `IDPathsByType`
  - `DefaultTargetSingletonSection`
- `internal/mcpx/checkAgenticScope(...)` still does not use those metadata
  target paths to derive write targets
- there is still no Go-owned MCP write/structural tool on the server surface

## Scope

This focused slice covers:

- explicit target-id extraction from MCP tool arguments using
  `Metadata.IDPathsByType`
- scope decisions for section-targeted write tools using extracted targets
- one first scoped write pilot tool:
  - `set_code_section_diagnostics_mute`
- thin reuse of the existing Go diagnostics-ignore runtime and diagnostics
  reapply path

## Non-Goals

- broad project-state MCP parity
- code-object target extraction parity in the same slice
- the first structural tool in the same slice
- UI-setting reveal mutations
- generic arbitrary argument rewriting beyond the current explicit paths

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-invocation-edge-id-translation-and-lsp-diagnostics.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/agentic/agentic_scope.py`
- `backend/setta/mcp/id_path_utils.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/agentic/test_agentic_scope.py`
- `tests/project_state/test_code_section_diagnostics_ignore.py`
- `internal/httpapi/lsp_routes.go`
- `internal/projectstate/code_section_diagnostics_ignore.go`

## Dependency Finding

The next useful MCP step is not another read tool.

The highest-leverage missing behavior is the first mutation path that proves:

1. tool metadata can identify concrete write targets
2. scope checks can reject out-of-scope write targets explicitly
3. Go can reuse an existing runtime mutation path without copying transport
   logic into MCP handlers

`set_code_section_diagnostics_mute` is the best bounded pilot because:

- the mutation already exists in Go runtime and HTTP transport
- it targets exactly one `sectionId`
- it uses `access_type="write"` in Python
- it stays inside the already-migrated LSP diagnostics/project-state boundary

## Working Decisions

- port the Python id-path extraction shape narrowly
  - dot-path lookup over argument objects
  - string / string-list extraction for section ids
  - no heuristic field-name scanning for write targets
- keep the first target extraction slice section-only
  - do not mix in code-object target mapping yet
  - do not mix in default-singleton fallback yet
- keep the first write tool narrow
  - add `set_code_section_diagnostics_mute`
  - defer `set_code_section_diagnostic_code_suppression` unless it falls out
    almost for free after the pilot is complete
- reuse Go runtime mutation owners
  - MCP should call runtime methods and diagnostics reapply helpers
  - do not route MCP internally through HTTP handlers

## Proposed Go Boundaries

### `internal/mcpx`

Own:

- metadata-driven target extraction from MCP arguments
- write-scope decision shaping
- MCP write-tool registration and argument/result translation

Do not own:

- project-state persistence rules
- diagnostics ignore-state storage details

### `internal/projectstate`

Own:

- diagnostics-ignore mutation semantics
- saved snapshot lifecycle

### `internal/httpapi`

Own:

- existing REST route surface only
- no duplicated MCP-specific scope rules

## Implementation Steps

1. Add target extraction helpers under `internal/mcpx`.
   - port the simple path-selection model from Python
   - support extracting section ids from argument objects through metadata

2. Refactor scope checks to use extracted targets for writes.
   - include `targetSectionIds` and `blockedSectionIds` in denied results
   - keep untargeted write behavior explicit instead of silently allowing it

3. Add `set_code_section_diagnostics_mute`.
   - register as a discoverable write tool
   - metadata:
     - `AccessTypeWrite`
     - `IDPathsByType[section] = ["sectionId"]`
   - call the Go runtime mutation and diagnostics reapply path

4. Cover the slice with focused tests.
   - path extraction unit tests
   - scope-check tests for allowed and denied section targets
   - MCP server tests for scoped write behavior
   - HTTP/app integration tests for the expanded tool catalog and mutation path

## Acceptance

- section-targeted write tools derive their targets from metadata paths
- out-of-scope writes fail with explicit blocked/target ids
- `set_code_section_diagnostics_mute` is callable through Go MCP transports
- the MCP mutation path reuses Go runtime owners instead of duplicating route
  logic

## Recommended Follow-On

- extend the same extraction boundary to:
  - code-object target mapping
  - default singleton fallback
  - the first structural tool once the write pilot is stable
