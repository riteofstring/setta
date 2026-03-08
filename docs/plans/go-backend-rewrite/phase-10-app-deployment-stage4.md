# Phase 10 App Deployment Stage 4

## Purpose

This doc scopes the fourth bounded Phase 10 slice after the completed Go-owned
`setta launch`, default local `setta`, and `setta share` migrations.

The goal is to move `setta app` onto the shipped Go-owned CLI without pulling
maintenance commands or app-definition runtime internals into the same change.

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
  validate published app deployments in:
  - `internal/deployments/catalog.go`
  - `internal/deployments/manifest.go`
  - `internal/deployments/runtime.go`
- Python still owns the user-facing `setta app` command in
  `backend/setta/start.py`, including:
  - `--deployment-root` versus `--deployment-name` / `--version` / `--latest`
    selection
  - public-host no-auth warning
  - startup URL output and browser auto-open behavior

## Inputs

- `docs/plans/go-backend-rewrite/phase-10-local-runtime-command-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-10-share-deployment-stage3.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `tests/start/test_startup_helpers.py`
- `tests/start/test_module_entrypoint.py`
- `cmd/setta-server/main.go`
- `cmd/setta-server/startup.go`
- `internal/settacmd/share.go`
- `internal/config/config.go`
- `internal/deployments/catalog.go`
- `internal/deployments/manifest.go`
- `internal/deployments/runtime.go`
- `internal/httpapi/deployment_routes_test.go`

## Problem Shape

The backend runtime already supports app mode.

The remaining gap is the user-facing `setta app` command contract:

1. the shipped router does not yet expose an `app` subcommand
2. named app deployment selection still lives in Python
3. startup output and no-auth warning for app mode are still Python-owned

## Scope

This stage should cover only:

- `setta app`
- thin dispatch from the shipped Python entrypoint to Go
- Go-owned app deployment selection, validation, and startup UX

Do not include:

- app-definition mutation/runtime changes
- `backups`
- `plugins`
- `export-db`
- remote/session-launch changes

## Working Decisions

- keep `cmd/setta` thin
  - parse `setta app` flags and delegate the long-lived runtime to the sibling
    `setta-server` executable
- keep `cmd/setta-server` as the long-lived app runtime owner
  - it should own startup warning/output and browser-open behavior for app mode
- resolve named deployments through the Go deployment catalog
  - use `internal/deployments.DefaultCatalogRoot` plus `Catalog.Latest` /
    `Catalog.ListVersions`
  - do not reimplement Python path guessing for deployment names/versions
- keep explicit deployment-root validation deterministic
  - load the manifest from the requested root
  - require `deploymentType == app`
- reject `--reload` explicitly in the shipped Go CLI for app mode
- if a small shared deployment-command helper cleanly covers both `share` and
  `app`, that refactor is in scope
  - do not turn this into a broad CLI abstraction pass

## Implementation Shape

1. add `app` routing to `internal/settacmd`
2. implement app deployment resolution in Go
   - explicit `--deployment-root`
   - catalog-backed `--deployment-name` + `--latest`
   - catalog-backed `--deployment-name` + `--version`
3. delegate resolved app runs to the sibling `setta-server`
   - pass `--mode app`
   - pass the resolved `--deployment-root`
   - pass relevant global host/port/log/no-open/runtime flags
4. extend `cmd/setta-server` startup UX for app mode
   - public-host no-auth warning
   - `Starting app backend for ...`
   - `App URL: ...`
   - browser-open fallback
5. update the thin Python wrapper to dispatch `app` to Go

## Test Strategy

- add focused `internal/settacmd` tests for:
  - subcommand routing
  - catalog-backed latest/version resolution for app deployments
  - explicit manifest-type validation for app deployments
  - delegated `setta-server` argv shape
  - `--reload` rejection
- add focused `cmd/setta-server` tests for:
  - app startup output
  - public-host warning
  - app URL browser-open fallback
- extend `tests/start/test_module_entrypoint.py` so `python -m setta app ...`
  dispatches to Go

## Explicit Non-Goals

- app-definition transport/runtime changes
- deployment runtime internals
- broad Click-tree preservation
- `--reload` parity

## Verification

- `git diff --check`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/settacmd -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./cmd/setta-server -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`

## Recommended Next Step

Implement this Stage 4 slice, then close out the local-runtime cluster and
re-evaluate whether maintenance commands should move at all.
