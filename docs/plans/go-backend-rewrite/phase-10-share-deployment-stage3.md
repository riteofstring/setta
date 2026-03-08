# Phase 10 Share Deployment Stage 3

## Purpose

This doc scopes the third bounded Phase 10 slice after the completed Go-owned
`setta launch` and default local `setta` migrations.

The goal is to move `setta share` onto the shipped Go-owned CLI without pulling
`app` or maintenance commands into the same change.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
- Go already owns the backend deployment runtime in:
  - `cmd/setta-server`
  - `internal/app`
  - `internal/config`
  - `internal/deployments`
- Go already owns deployment catalog/runtime primitives that can resolve and
  validate published share deployments in:
  - `internal/deployments/catalog.go`
  - `internal/deployments/manifest.go`
  - `internal/deployments/runtime.go`
- Python still owns the user-facing `setta share` command in
  `backend/setta/start.py`, including:
  - `--deployment-root` versus `--deployment-name` / `--version` / `--latest`
    selection
  - public-host no-auth warning
  - startup URL output and browser auto-open behavior

## Inputs

- `docs/plans/go-backend-rewrite/phase-10-local-runtime-command-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-10-default-local-ide-start-stage2.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `tests/start/test_startup_helpers.py`
- `cmd/setta-server/main.go`
- `internal/settacmd/start.go`
- `internal/config/config.go`
- `internal/config/config_test.go`
- `internal/deployments/catalog.go`
- `internal/deployments/manifest.go`
- `internal/deployments/paths.go`
- `internal/app/app.go`

## Problem Shape

The backend runtime already supports share mode.

The remaining gap is the user-facing `setta share` command contract:

1. the shipped router does not yet expose a `share` subcommand
2. named deployment selection still lives in Python
3. startup output and no-auth warning for share mode are still Python-owned

## Scope

This stage should cover only:

- `setta share`
- thin dispatch from the shipped Python entrypoint to Go
- Go-owned share deployment selection, validation, and startup UX

Do not include:

- `setta app`
- `backups`
- `plugins`
- `export-db`
- remote/session-launch changes

## Working Decisions

- keep `cmd/setta` thin
  - parse `setta share` flags and delegate the long-lived runtime to the
    sibling `setta-server` executable
- keep `cmd/setta-server` as the long-lived share runtime owner
  - it should own startup warning/output and browser-open behavior for share
    mode
- resolve named deployments through the Go deployment catalog
  - use `internal/deployments.DefaultCatalogRoot` plus `Catalog.Latest` /
    `Catalog.ListVersions`
  - do not reimplement Python path guessing for deployment names/versions
- keep explicit deployment-root validation deterministic
  - load the manifest from the requested root
  - require `deploymentType == share`
- reject `--reload` explicitly in the shipped Go CLI for share mode

## Implementation Shape

1. add `share` routing to `internal/settacmd`
2. implement share deployment resolution in Go
   - explicit `--deployment-root`
   - catalog-backed `--deployment-name` + `--latest`
   - catalog-backed `--deployment-name` + `--version`
3. delegate resolved share runs to the sibling `setta-server`
   - pass `--mode share`
   - pass the resolved `--deployment-root`
   - pass relevant global host/port/log/no-open/runtime flags
4. extend `cmd/setta-server` startup UX for share mode
   - public-host no-auth warning
   - `Starting share backend for ...`
   - `Share URL: ...`
   - browser-open fallback
5. update the thin Python wrapper to dispatch `share` to Go

## Test Strategy

- add focused `internal/settacmd` tests for:
  - subcommand routing
  - deployment-root selection conflicts
  - catalog-backed latest/version resolution
  - explicit manifest-type validation
  - delegated `setta-server` argv shape
- add focused `cmd/setta-server` tests for:
  - share startup output
  - public-host warning
  - share URL browser-open fallback
- extend `tests/start/test_module_entrypoint.py` so `python -m setta share ...`
  dispatches to Go

## Explicit Non-Goals

- `app` mode migration
- changing deployment runtime internals
- broad Click-tree preservation
- `--reload` parity

## Verification

- `git diff --check`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/settacmd -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./cmd/setta-server -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`

## Recommended Next Step

Implement this Stage 3 slice, then move to the remaining local-runtime command:

1. `app`
