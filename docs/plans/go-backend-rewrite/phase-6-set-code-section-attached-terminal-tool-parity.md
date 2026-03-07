# Phase 6 Set Code Section Attached Terminal Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
compare-and-set UI-setting cluster.

The highest-leverage remaining MCP mutation gap is now:

- `set_code_section_attached_terminal`

This slice is attractive because Go already owns most of the hard attached
terminal invariants in the run-graph runtime. The remaining work is the
explicit attach/detach owner plus thin MCP transport.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- compare-and-set UI-setting parity is complete
- Go already owns important attached-terminal foundations:
  - run-time validation for existing attached terminals
  - ensure/create attached terminal helpers in the run graph
  - attached-terminal cleanup when sections are deleted
  - child-terminal creation paths that seed terminal sizing correctly
- Go does not yet own the explicit attach/detach mutation transport exposed by
  Python `set_code_section_attached_terminal`

## Scope

This focused slice covers:

- a Go runtime owner for explicit code-section terminal attach/detach
- attach validation for:
  - code-family parent sections only
  - terminal child sections only
  - missing target rejection
- detach behavior that restores the terminal to top-level layout state
- reuse of the existing attached-terminal size normalization rules already used
  by child creation and run-time ensure flows
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

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
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
  - `EnsureCodeSectionAttachedTerminal`
  - existing attached-terminal size seeding/promotion logic
- keep transport thin
  - the MCP tool should parse arguments and delegate
- do not broaden this slice into generic move or resize transport

## Implementation Outline

1. Add the explicit attach/detach owner.
   - attach an existing terminal to a code-family section
   - detach the current terminal back to top-level layout state
   - preserve existing attached-terminal invariants in both typed state and
     payload state

2. Reuse existing sizing rules.
   - attached terminal width should align to the parent
   - attached terminal height should be concrete
   - parent code height should respect the embedded-terminal minimum

3. Add MCP parity.
   - structural access
   - project-scoped invocation
   - temp-id translation

4. Add focused tests.
   - runtime attach/detach round-trip
   - invalid target rejection
   - MCP server + route + SSE coverage

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test(Runtime|Document).*(AttachedTerminal|SetCodeSectionAttachedTerminal)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServerSetCodeSectionAttachedTerminal|TestServerListsToolsAndScopesToolCalls' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SetCodeSectionAttachedTerminal|SupportsSetCodeSectionAttachedTerminal)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsSetCodeSectionAttachedTerminal|TestAppIDEMCPServerSupportsAuthenticatedSSECalls' -count=1 -timeout 420s`

## Open Questions

- whether detach should preserve the terminal's prior top-level position when
  possible or seed a fresh top-level layout entry every time
  - recommendation: preserve existing top-level layout when present; otherwise
    seed a deterministic top-level layout entry in the owner

## Next Recommended Step

- implement the explicit attached-terminal owner first in
  `internal/projectstate`
- commit the owner plus focused runtime tests before adding MCP transport

## Progress Notes

- 2026-03-07: doc created immediately after the completed compare-and-set
  UI-setting slice moved the next bounded Phase 6 step to
  `set_code_section_attached_terminal`.
