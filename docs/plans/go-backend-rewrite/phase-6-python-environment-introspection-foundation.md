# Phase 6 Python Environment Introspection Foundation

## Purpose

This doc scopes the final remaining non-project-state Python MCP gap after the
completed plugin-management transport slice.

The goal is to add an explicit Go owner for Python-environment selection and
package inspection before implementing `getInstalledPythonPackages`.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- the remaining non-project-state Python MCP gap count is 1
- Go now owns:
  - the full non-project-state MCP surface except
    `getInstalledPythonPackages`
  - a current-process Python selection path inside
    `internal/lsp/current_process.go`
  - plugin-management runtime and MCP transport parity
- Go does not yet own:
  - a reusable Python-environment runtime boundary shared outside LSP
  - a typed package-inspection owner for the selected interpreter
  - MCP transport parity for `getInstalledPythonPackages`

## Scope

This slice should cover:

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

1. LSP already has interpreter resolution
   - `internal/lsp/current_process.go` resolves the current-process Python
     interpreter from `SETTA_LSP_PYTHON`, then `VIRTUAL_ENV`, then `python3` /
     `python`
   - that logic is not currently reusable outside the LSP session owner

2. MCP still lacks an environment source of truth
   - `getInstalledPythonPackages` cannot be implemented cleanly until Go owns
     which interpreter/environment the tool is supposed to inspect
   - shelling out to an arbitrary binary without that owner would violate the
     rewrite requirement to avoid heuristics

## Working Decisions

- promote Python interpreter selection into an explicit reusable Go runtime
  owner instead of re-implementing ad hoc shell logic in MCP
- inspect packages through the selected interpreter itself, not by guessing
  from the current Go process environment
- prefer an `importlib.metadata`-based subprocess payload over `pip list` so
  the result does not depend on pip being installed or on pip-specific output
  formatting

## Recommended Implementation Order

1. Extract interpreter resolution
   - move the current-process Python resolution logic into a reusable package
     that can serve both LSP and MCP

2. Add package inspection runtime
   - run the selected interpreter with a small deterministic `importlib.metadata`
     script and normalize the result into sorted `name=version` strings

3. Add MCP transport
   - expose `getInstalledPythonPackages` as an unscoped read tool over the new
     runtime owner

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/lsp -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx ./internal/httpapi ./internal/app -count=1 -timeout 420s`
