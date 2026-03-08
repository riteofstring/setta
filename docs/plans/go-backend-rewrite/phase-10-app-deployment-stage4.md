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
- this stage is now complete:
  - `cmd/setta` exposes `setta app`
  - named app deployments resolve through the Go deployment catalog
  - explicit `--deployment-root` validation is Go-owned and manifest-backed
  - `cmd/setta-server` owns app startup warning/output and browser-open
    fallback
  - the thin Python entrypoint dispatches `app` to the packaged Go binary

## Inputs

- `docs/plans/go-backend-rewrite/phase-10-local-runtime-command-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-10-share-deployment-stage3.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `tests/start/test_startup_helpers.py`
- `tests/start/test_module_entrypoint.py`
- `cmd/setta-server/main.go`
- `cmd/setta-server/startup.go`
- `internal/settacmd/deployment_command.go`
- `internal/settacmd/app.go`
- `internal/settacmd/share.go`
- `internal/config/config.go`
- `internal/deployments/catalog.go`
- `internal/deployments/manifest.go`
- `internal/deployments/runtime.go`
- `internal/httpapi/deployment_routes_test.go`

## Completed Work

This stage shipped the remaining user-facing `setta app` contract onto the
Go-owned runtime boundary:

1. added `app` routing in `internal/settacmd` and `cmd/setta`
2. resolved named app deployments through `internal/deployments.DefaultCatalogRoot`
   plus `Catalog.Latest` / `Catalog.ListVersions`
3. kept explicit `--deployment-root` validation manifest-backed and
   deterministic
4. delegated long-lived app runs to the sibling `setta-server` executable
5. moved app startup warning/output and browser-open fallback into
   `cmd/setta-server`
6. updated `backend/setta/entrypoint.py` so packaged `python -m setta app`
   dispatches to Go

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

## Decisions Made

- `share` and `app` now share the same Go deployment-command source-of-truth
  path for named lookup, explicit-root validation, and delegated argv shape
- `setta-server` startup output now owns app-mode warning and printed app URL,
  matching the runtime boundary used for IDE mode and share mode
- omitted host/port values still resolve to the shipped runtime defaults
  (`127.0.0.1` and an OS-assigned port via `--port 0`)

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

## Open Questions

- none for this stage; the local-runtime command cluster is now complete

## Recommended Next Step

Close out Phase 10 and keep the remaining maintenance commands explicitly
Python-owned unless a separate later slice is justified:

1. `backups`
2. `plugins`
3. `export-db`
