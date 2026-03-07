# Phase 6 Set Code Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
post-`delete_kwarg` inventory step.

The highest-leverage remaining MCP mutation gap is `set_code`.

Python agents currently treat `set_code` as the standard way to edit Code
sections, and Go already owns the authoritative inline-edit transport plus the
Watch Code and LSP-aware update path behind `/setCode`.

## Status

Current repo status as of 2026-03-07:

- this slice is planned
- the main missing piece is MCP parity over the completed Go code-update owner
- the highest-risk mistake would be routing MCP `set_code` directly to raw
  project-state writes and skipping the existing Watch Code / LSP update path

## Scope

This focused slice covers:

- a Go MCP `set_code` write tool
- a dedicated MCP-facing code-update provider boundary that reuses the existing
  Go code-update owner
- scoped `sectionId` targeting and temporary-id translation
- explicit error mapping for:
  - missing project id
  - missing section id
  - missing section
  - non-code section targets
  - read-only code bindings
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - allowed scoped code edits
  - out-of-scope rejection
  - temporary-id translation
  - read-only code-section rejection

## Non-Goals

- `format_code`
- `set_gen_code_prefix`
- `set_gen_code_suffix`
- code-completion transport
- changing the existing `/setCode` HTTP route behavior
- bypassing Watch Code or LSP-sensitive code-update ordering

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-inline-edit-and-bound-code-file-reuse.md`
- `docs/reference/watch-code.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/system_prompt.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_watch_code.py`
- `tests/project_state/test_set_code_access_mode.py`
- `internal/app/code_updates.go`
- `internal/projectstate/code_updates.go`
- `internal/httpapi/project_routes.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python `BaseProjectManager.set_code(...)` does more than mutate a code string:

1. it validates that the targeted section is a real code section
2. it rejects read-only code-file bindings
3. it persists the inline code edit
4. for bound Python sections, it syncs LSP before feeding the updated code
   through Watch Code apply logic
5. it broadcasts the refreshed project state

The Go rewrite already owns that behavior for the IDE HTTP `/setCode` route
through `internal/app/code_updates.go`. MCP should reuse that same owner.

## Working Decisions

- keep `set_code` authoritative in the existing Go code-update service
  - MCP should not call `projectstate.Runtime.SetCode(...)` directly
  - the service boundary already preserves the completed Watch Code and
    LSP-before-apply behavior
- keep transport thin
  - MCP validates arguments, enforces scope, and delegates to the code-update
    provider
- keep the output simple
  - return `{ status: "ok" }`
- keep the slice narrowly scoped
  - do not bundle formatting or Python codegen-target prefix/suffix edits
- map read-only and invalid section cases as structured invalid-argument MCP
  failures rather than ad-hoc text blobs

## Implementation Outline

1. Add an MCP-facing code-update provider boundary.
   - extend `internal/mcpx.ServerOptions`
   - pass the existing Go code-update service from app wiring into the MCP
     server
   - avoid duplicating Watch Code / LSP logic in MCP handlers

2. Register the `set_code` tool.
   - `accessType: write`
   - `idPathsByType.section = ["sectionId"]`
   - input: `projectConfigId`, `sectionId`, `code`
   - output: `status`

3. Normalize mutation errors.
   - map `ErrCodeSectionRequired`
   - map `ErrCodeSectionReadOnly`
   - preserve existing project/section not-found handling

4. Add focused tests.
   - MCP server metadata and tool-count coverage
   - allowed and blocked scoped writes
   - temp-id translation
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- pending implementation

## Open Questions

- none at slice start

## Next Recommended Step

- implement this slice before widening into `format_code` or gen-code prefix /
  suffix MCP work

## Progress Notes

- 2026-03-07: doc created after the post-`delete_kwarg` inventory identified
  `set_code` as the highest-leverage remaining MCP mutation gap.
