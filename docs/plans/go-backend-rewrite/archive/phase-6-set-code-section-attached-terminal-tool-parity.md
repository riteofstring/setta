# Phase 6 Set Code Section Attached Terminal Tool Parity

## Purpose

This doc scoped the bounded Phase 6 slice that closed Go MCP parity for
`set_code_section_attached_terminal`.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- `set_code_section_attached_terminal` is now complete
- Go now owns:
  - explicit attached-terminal attach/detach mutations in
    `internal/projectstate/attached_terminal_writes.go`
  - settings-backed parent/terminal size normalization during explicit attach
  - deterministic top-level layout restoration on explicit detach
  - MCP parity for `set_code_section_attached_terminal`
  - authenticated route and SSE coverage for the new structural tool

## Scope

This focused slice covers:

- a Go runtime owner for explicit code-section terminal attach/detach
- attach validation for:
  - code-family parent sections only
  - terminal child sections only
  - missing target rejection
- detach behavior that restores the terminal to top-level layout state
- reuse of the existing attached-terminal size normalization rules already used
  by child creation and now by the explicit attach/detach owner
- Go MCP parity for `set_code_section_attached_terminal`
- focused tests for:
  - attach/detach round-trip behavior
  - size normalization and width sync expectations that are part of the product
    contract
  - invalid terminal/invalid parent rejection
  - temp-id translation and scoped structural routing

## Non-Goals

- terminal session process/runtime work
- generic move-sections parity
- section-sizing broad transport parity
- section-variant transport work
- app-definition MCP work

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/reference/section-sizing-and-ux.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_code_section_attached_terminal.py`
- `internal/projectstate/run_graph.go`
- `internal/projectstate/run_graph_test.go`
- `internal/projectstate/child_section_creation.go`
- `internal/projectstate/child_section_creation_test.go`
- `internal/httpapi/terminal_routes_test.go`

## Current Python Behavior

Python `set_code_section_attached_terminal`:

1. validates that the target section is a code-family section
2. attaches a terminal child when `terminalSectionId` is provided
3. detaches the currently attached terminal when `terminalSectionId` is `null`
4. keeps attached terminals out of top-level layout state while attached
5. restores them to top-level layout state when detached
6. normalizes attached-terminal sizing so embedded terminals keep a concrete
   height and width aligned to the parent code section

The Python tests treat attach/detach as an explicit structural mutation with
strong state invariants, not as a heuristic move side effect.

## Working Decisions

- keep the owner in `internal/projectstate`
  - attached-terminal invariants belong with the run-graph/project-state
    runtime, not the MCP transport
- reuse existing Go helpers where possible
  - `ValidateAttachedTerminal`
  - existing attached-terminal size parsing and policy helpers
- keep transport thin
  - the MCP tool should parse arguments and delegate
- do not broaden this slice into generic move or resize transport
- allow explicit attach to move a terminal out of an existing parent
  - the owner clears the old parent relationship directly instead of adding a
    generic move-sections transport shim
- when a detached terminal has no surviving top-level layout entry, seed a
  fresh deterministic top-level layout from the remaining active top-level
  canvas

## Implementation Outline

1. Add the explicit attach/detach owner.
   - completed in `internal/projectstate/attached_terminal_writes.go`

2. Reuse existing sizing rules.
   - completed for explicit attach/detach mutations

3. Add MCP parity.
   - completed in `internal/mcpx/server.go`

4. Add focused tests.
   - completed across `internal/projectstate`, `internal/mcpx`,
     `internal/httpapi`, and `internal/app`

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test(Runtime|Document).*(AttachedTerminal|SetCodeSectionAttachedTerminal)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SetCodeSectionAttachedTerminal)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsSetCodeSectionAttachedTerminal|SetCodeSectionAttachedTerminalAcceptsTemporaryIDs)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsSetCodeSectionAttachedTerminalOverAuthenticatedSSE|ServerSupportsTemporaryIDsForSetCodeSectionAttachedTerminalOverAuthenticatedSSE|ToolCallRouteSupportsSetCodeSectionAttachedTerminal)' -count=1 -timeout 420s`

## Open Questions

- none for this slice

## Next Recommended Step

- use `phase-6-set-section-sizes-tool-parity.md` as the next bounded Phase 6
  slice
- keep the next code chunk focused on a reusable section-size normalization
  owner before adding more layout mutation transport

## Progress Notes

- 2026-03-07: doc created immediately after the completed compare-and-set
  UI-setting slice moved the next bounded Phase 6 step to
  `set_code_section_attached_terminal`.
- 2026-03-07: explicit attached-terminal attach/detach ownership landed in
  `internal/projectstate/attached_terminal_writes.go` with focused runtime
  coverage for round-trip attach/detach, invalid targets, and terminal moves
  from existing parents.
- 2026-03-07: MCP parity landed in `internal/mcpx/server.go` with focused
  server, route, and authenticated SSE coverage, including temp-id translation.
- 2026-03-07: reranking the remaining mutation gaps moved the next bounded
  slice to `set_section_sizes`, which needs its own implementation-plan doc.
