# Phase 6 Python Environment Introspection Foundation

## Purpose

This doc scopes the final remaining non-project-state Python MCP gap after the
completed plugin-management transport slice.

The goal is to add an explicit Go owner for Python-environment selection and
package inspection before implementing `getInstalledPythonPackages`.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- the remaining non-project-state Python MCP gap count is 0
- Go now owns:
  - the full non-project-state MCP surface, including
    `getInstalledPythonPackages`
  - a reusable current-process Python runtime owner in
    `internal/pythonenv/runtime.go`
  - a shared interpreter-resolution path reused by
    `internal/lsp/current_process.go`
  - unscoped MCP/HTTP/app parity for `getInstalledPythonPackages`
- the bounded environment-introspection slice is complete and closed

## Scope

This slice covers:

- a reusable Go owner for selecting the canonical IDE Python interpreter
- a typed package-inspection runtime over that interpreter
- the bounded MCP transport for `getInstalledPythonPackages`

## Non-Goals

- Python virtualenv creation or activation management
- frontend environment-management UI
- deployment-mode Python package inspection
- heuristic interpreter discovery beyond an explicit documented precedence

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `backend/setta/mcp/tools/base_tools.py`
- `tests/mcp/test_base_tools.py`
- `internal/lsp/current_process.go`
- `internal/app/app.go`

## Current Python Behavior

1. Tool behavior
   - `getInstalledPythonPackages` reads distributions from the current Python
     process via `importlib.metadata.distributions()`
   - output is a case-insensitively sorted list of `name=version` strings

2. Transport behavior
   - the tool is unscoped and read-only
   - there is no extra selection argument for choosing an interpreter

## Relevant Go State

1. Go now has a shared interpreter owner
   - `internal/pythonenv/runtime.go` resolves the canonical IDE interpreter
     from `SETTA_PYTHON`, then `SETTA_LSP_PYTHON`, then `VIRTUAL_ENV`, then
     `python3` / `python`
   - `internal/lsp/current_process.go` now reuses that owner instead of
     carrying separate interpreter-selection logic

2. MCP now has an explicit environment source of truth
   - `getInstalledPythonPackages` shells out through the selected interpreter
     itself with a deterministic `importlib.metadata` payload
   - the MCP server exposes that owner as an unscoped read tool instead of
     guessing from the current Go process

## Working Decisions

- promote Python interpreter selection into an explicit reusable Go runtime
  owner instead of re-implementing ad hoc shell logic in MCP
- add `SETTA_PYTHON` as the generic explicit override ahead of the legacy
  LSP-specific `SETTA_LSP_PYTHON`
- inspect packages through the selected interpreter itself, not by guessing
  from the current Go process environment
- prefer an `importlib.metadata`-based subprocess payload over `pip list` so
  the result does not depend on pip being installed or on pip-specific output
  formatting

## Implementation Result

1. Shared runtime owner
   - added `internal/pythonenv/runtime.go` for interpreter selection and
     installed-package inspection

2. LSP reuse
   - repointed `internal/lsp/current_process.go` at the shared interpreter
     resolver instead of keeping a second owner

3. Thin transport
   - exposed `getInstalledPythonPackages` through MCP, the authenticated tool
     route, and IDE SSE over the shared runtime owner

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/pythonenv ./internal/lsp -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|GetInstalledPythonPackagesReturnsProviderPayload|SearchMCPToolsUsesDiscoverableToolsAndServerFilters|GetMCPServerRuntimeStatusReturnsClientStatuses|GetProjectConfigNamesAndIDsReturnsSortedMetadata|GetTerminalOutputReturnsBufferedHistory|GetAppCatalogAndListAppComponentsReturnDefaultCatalog|GetSettaDocsLoadsDefaultBundleAndRejectsEscapes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsUtilityReadInitTools' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsUtilityReadToolsOverAuthenticatedSSE|ToolCallRouteSupportsUtilityReadInitTools)' -count=1 -timeout 420s`

## Progress Notes

- 2026-03-08: completed the shared `internal/pythonenv` owner, repointed the
  LSP current-process session at that owner, and added full Go transport parity
  for `getInstalledPythonPackages`, reducing the remaining non-project-state
  Python MCP gap count from 1 to 0.
