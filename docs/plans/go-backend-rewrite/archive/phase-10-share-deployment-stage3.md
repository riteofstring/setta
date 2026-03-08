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
- this stage is now complete:
  - `cmd/setta` exposes `setta share`
  - named share deployments resolve through the Go deployment catalog
  - explicit `--deployment-root` validation is Go-owned and manifest-backed
  - `cmd/setta-server` owns share startup warning/output and browser-open
    fallback
  - the thin Python entrypoint dispatches `share` to the packaged Go binary

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-10-local-runtime-command-cluster-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-10-default-local-ide-start-stage2.md`
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

## Completed Work

This stage shipped the remaining user-facing `setta share` contract onto the
Go-owned runtime boundary:

1. added `share` routing in `internal/settacmd` and `cmd/setta`
2. resolved named deployments through `internal/deployments.DefaultCatalogRoot`
   plus `Catalog.Latest` / `Catalog.ListVersions`
3. kept explicit `--deployment-root` validation manifest-backed and
   deterministic
4. delegated long-lived share runs to the sibling `setta-server` executable
5. moved share startup warning/output and browser-open fallback into
   `cmd/setta-server`
6. updated `backend/setta/entrypoint.py` so packaged `python -m setta share`
   dispatches to Go

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

## Decisions Made

- share deployment selection in Go uses the deployment catalog as the source of
  truth for named lookups
- `setta-server` startup output now owns the share-mode warning and printed
  share URL, matching the runtime boundary used for local IDE mode
- omitted host/port values still resolve to the shipped runtime defaults
  (`127.0.0.1` and an OS-assigned port via `--port 0`)

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

## Open Questions

- none for this stage; the remaining work is the next command migration slice

## Recommended Next Step

Port the remaining deployment command:

1. `app`
