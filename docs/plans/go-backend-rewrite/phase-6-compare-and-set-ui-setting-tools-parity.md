# Phase 6 Compare-And-Set UI Setting Tools Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`format_code` work.

The highest-leverage remaining MCP mutation gap is now the compare-and-set
UI-setting cluster:

- `compare_and_set_show_param_display_names`
- `compare_and_set_watch_code_enabled`
- `compare_and_set_watch_code_folders`
- `compare_and_set_watch_code_files`

These tools reuse already-landed Go runtime owners for layout presentation and
Watch Code, but they add a distinct product contract: side-effect-free no-op
behavior when the observed value already matches the requested value or the
caller-supplied precondition is stale.

## Status

Current repo status as of 2026-03-07 after implementation:

- Phase 6 MCP parity remains the active phase
- this compare-and-set slice is now complete
- Go now owns:
  - compare-and-set runtime owners for `showParamDisplayNames`
  - compare-and-set runtime owners for Watch Code enabled, folders, and files
  - MCP parity for:
    - `compare_and_set_show_param_display_names`
    - `compare_and_set_watch_code_enabled`
    - `compare_and_set_watch_code_folders`
    - `compare_and_set_watch_code_files`
- stale-precondition failures now normalize to MCP/UI-setting error code
  `mutation_failed`

## Scope

This focused slice covers:

- a Go compare-and-set owner for `showParamDisplayNames`
- Go compare-and-set owners for Watch Code enabled, folders, and files
- side-effect-free no-op behavior when the requested new value already matches
  the observed value
- explicit stale-precondition handling when `expectedOldValue` is provided and
  no longer matches the observed value
- reuse of existing Watch Code baseline-on-enable and baseline-for-new-inputs
  behavior on real writes only
- Go MCP parity for the four compare-and-set tools
- focused tests for:
  - same-value no-op behavior
  - stale-precondition rejection without clobbering concurrent writes
  - real writes preserving existing show/watch-code behavior
  - temp-id translation and scoped/unscoped structural routing as appropriate

## Non-Goals

- section-variant mutation work
- app-definition MCP work
- layout/group presentation mutations
- adding heuristic compare logic
- broadening CAS support to unrelated settings in the same slice

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-6-set-show-param-display-names-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-set-watch-code-enabled-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-set-watch-code-inputs-tool-parity.md`
- `docs/reference/watch-code.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_ui_setting_reveal_leases.py`
- `tests/mcp/test_ui_setting_tools.py`
- `internal/projectstate/watch_code.go`
- `internal/projectstate/layout_presentation.go`
- `internal/httpapi/project_routes.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python compare-and-set UI-setting tools:

1. read the current project-config value
2. optionally compare it with a caller-provided `expected_old_value`
3. if the precondition is stale, they do not write or broadcast
4. if the requested new value is already equal to the observed value, they
   return the old/new pair without side effects
5. otherwise they apply the real mutation and return `(old_value, new_value)`
6. for Watch Code:
   - enabling still baselines only on `false -> true`
   - folder/file writes still normalize inputs and baseline only new inputs

The Python tests treat same-value CAS as fully side-effect-free: no history,
no broadcast, and no Watch Code baseline churn.

## Working Decisions

- keep compare-and-set semantics in dedicated Go owners
  - do not overload the existing unconditional write APIs with optional CAS
    flags
- reuse the existing Go write owners only after CAS preconditions pass
  - stale or same-value no-op paths must not trigger any persistence, broadcast,
    or Watch Code baselining
- keep MCP transport thin
  - tools validate arguments and delegate to the CAS owner
- return explicit old/new values from the owner
  - the transport can map stale-precondition failures cleanly without guessing
- keep the slice limited to project-config UI settings whose unconditional Go
  owners already exist

## Implementation Outline

1. Add the Go CAS owners.
   - add small compare-and-set helpers near the existing layout-presentation and
     Watch Code owners
   - support optional `expectedOldValue`
   - return old/new pairs on success
   - surface a dedicated stale-precondition product error

2. Reuse existing mutation pathways on real writes only.
   - `showParamDisplayNames` should continue to use the completed presentation
     owner
   - Watch Code enabled/folders/files should continue to use the completed
     Watch Code owner and its normalization/baselining rules

3. Add MCP parity for the four tools.
   - structural access
   - project-scoped invocation
   - temp-id translation
   - explicit stale-precondition error mapping

4. Add focused tests.
   - owner no-op and stale-precondition tests
   - MCP server tool metadata and behavior tests
   - authenticated route/SSE coverage where it adds value

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeCompareAndSet' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServerCompareAndSet' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteCompareAndSet' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsCompareAndSet' -count=1 -timeout 420s`

## Next Recommended Step

- move to `phase-6-set-code-section-attached-terminal-tool-parity.md`
- keep the next slice bounded to explicit attached-terminal attach/detach
  transport over the existing Go run-graph and section-sizing foundations

## Progress Notes

- 2026-03-07: doc created immediately after the completed `format_code` slice
  moved the next bounded Phase 6 step to the compare-and-set UI-setting and
  Watch Code tools cluster.
- 2026-03-07: completed the compare-and-set owner layer in
  `internal/projectstate` with:
  - side-effect-free no-op behavior that skips persistence when normalized state
    is unchanged
  - explicit `ExpectedOldValueMismatchError` stale-precondition failures
  - canonical empty-list handling for Watch Code folders/files so empty reads
    and empty caller preconditions compare consistently
- 2026-03-07: completed MCP/server, HTTP tool-route, and authenticated SSE
  parity for:
  - `compare_and_set_show_param_display_names`
  - `compare_and_set_watch_code_enabled`
  - `compare_and_set_watch_code_folders`
  - `compare_and_set_watch_code_files`
- 2026-03-07: normalized stale-precondition failures to MCP error code
  `mutation_failed` to match the existing UI-setting product contract.
