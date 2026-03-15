# Phase 11 Plugin Authoring And Local Link Stage 5

## Purpose

This doc scopes the fifth bounded Phase 11 implementation slice after the
completed plugin lifecycle-controls migration.

The goal is to move the self-contained local plugin authoring commands onto the
shipped Go CLI without broadening into the still-blocked remote source
acquisition and restart-hook work.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- Go already owns the completed plugin status/read slice:
  - `list`
  - `rescan`
  - `restart-required`
- Go already owns the completed plugin lifecycle-controls slice:
  - package-manager-aware discovery
  - `enable`
  - `disable`
  - `uninstall`
  - `rollback`
- Go now also owns the authoring/local-link slice in:
  - `internal/plugins/authoring.go`
  - `internal/settacmd/plugins.go`
  - `backend/setta/entrypoint.py`
- Python now owns only the remaining plugin commands:
  - `install`
  - `update`
  - `pin`
  - `lock write`
  - `lock apply`
  - `restart`

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-11-maintenance-command-inventory.md`
- `docs/plans/go-backend-rewrite/archive/phase-11-plugin-lifecycle-controls-stage4.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-plugin-management-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-plugin-management-mutation-owner.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/errors.py`
- `backend/setta/plugins/models.py`
- `tests/start/test_start_plugins.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/start/test_module_entrypoint.py`
- `internal/plugins/service.go`
- `internal/plugins/manifest.go`
- `internal/settacmd/plugins.go`

## Problem Shape

The remaining plugin CLI work is not one coherent slice.

The commands split into two different dependency groups:

1. self-contained local authoring and local-link flows
   - `init`
   - `validate`
   - `link`
2. remote source-acquisition and lockfile convergence flows
   - `install`
   - `update`
   - `pin`
   - `lock apply`
   - later `lock write`

Historical note from this stage's original landing:

- a real Go-owned candidate provider for remote plugin source acquisition

Go already had mutation service interfaces for candidates, but at original
landing time the shipped app did not yet wire a production candidate provider
into `internal/plugins`.
Porting remote install/update flows now would either fail unconditionally in
the shipped CLI or require a temporary compatibility shim back into Python.

That dependency is no longer missing as of 2026-03-09:

- the IDE app now wires the production candidate provider into the shared Go
  plugin service as part of the Phase 15 direct frontend install transport

That means the highest-leverage next step is to land only the bounded
authoring/local-link slice first.

## Scope

This stage should cover only:

- Go-owned plugin template init in `internal/plugins`
- Go-owned plugin folder validation in `internal/plugins`
- Go-owned local link workflow in `internal/plugins`
- thin Go CLI transport for:
  - `setta plugins init`
  - `setta plugins validate`
  - `setta plugins link`
- selective Python entrypoint dispatch for only those completed subcommands

Do not include:

- `plugins install`
- `plugins update`
- `plugins pin`
- `plugins lock write`
- `plugins lock apply`
- `plugins restart`
- programmatic restart-hook ownership
- historical remote candidate-provider work

## Working Decisions

- treat remote source acquisition as an explicit dependency boundary
  - do not hide a missing production candidate provider behind a Python
    fallback or a partially wired Go transport
- move the local authoring flows first
  - `init`, `validate`, and `link` are already bounded around filesystem,
    manifest, metadata, and install-state owners that exist in Go
- keep transport thin
  - `internal/settacmd` should parse flags, render CLI output, and call
    explicit plugin service methods only
- use robust version/specifier parsing
  - Setta-version compatibility checks must use a real PEP 440 owner in Go,
    not string matching or heuristic comparisons
- keep `link` semantically local
  - preserve symlink install behavior, install metadata with `local:` source
    ownership, restart-required bookkeeping, and post-link discovery checks

## Implementation Shape

1. add local authoring helpers in `internal/plugins`
   - plugin-template scaffolding
   - plugin-folder validation
   - pyproject/package metadata identity checks
   - PEP 440 Setta-version range validation
2. add local link ownership in `internal/plugins`
   - source-root validation
   - manifest/config validation before mutation
   - target reservation and replace/backup behavior
   - symlink activation and `local:` install metadata persistence
   - restart-required bookkeeping and post-link discovery verification
3. extend `internal/settacmd/plugins.go`
   - parse and render `init`, `validate`, and `link`
   - preserve existing scope-flag behavior for link
4. update the shipped Python entrypoint
   - dispatch only the completed authoring/local-link subcommands to Go
5. update active docs
   - record the narrower remaining plugin surface precisely

## Test Strategy

- add focused `internal/plugins` tests for:
  - init template generation across template variants
  - init target/id rejection
  - validate failures for missing manifest, invalid config schema, invalid
    host version, and incompatible version range
  - validate metadata identity mismatch via `pyproject.toml`
  - link happy-path symlink install and metadata persistence
  - link restart-required behavior for backend replacement
  - link rejection before mutation on incompatible version or invalid config
    schema
  - link failure if post-link discovery does not surface the plugin
- add focused `internal/settacmd` tests for:
  - `plugins init`
  - `plugins validate`
  - `plugins link`
  - text and JSON output shaping
- extend `tests/start/test_module_entrypoint.py`
  - route only the completed `plugins init|validate|link` subcommands to Go

## Explicit Non-Goals

- remote plugin install/update/pin
- lockfile write/apply convergence
- Go-owned programmatic restart
- historical app/runtime wiring of a production candidate provider

## Open Questions

- whether `lock write` should join the next plugin slice with the remote
  candidate-provider work, or stay separate as a lockfile-observation-only
  command
- whether `plugins restart` should remain a permanently manual-only CLI status
  command in local runtime mode, or gain a real Go-owned restart hook later

## Progress Notes

- 2026-03-08: created this Stage 5 plan to keep the remaining plugin CLI work
  bounded around the self-contained authoring/local-link slice first.
- 2026-03-08: completed the Stage 5 slice.
  - `setta plugins init|validate|link` now route through the shipped Go CLI
  - Go now owns plugin template scaffolding, local folder validation,
    `pyproject` metadata identity checks, PEP 440 Setta-version checks, and
    local symlink install semantics
  - local link now persists `local:` install metadata and preserves
    restart-required behavior for backend replacement
  - partial Python entrypoint dispatch now includes the completed
    authoring/local-link subcommands

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/buildinfo ./internal/plugins ./internal/settacmd -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`
- `git diff --check`

## Recommended Next Step

Stage 6 planning now lives in
`phase-11-plugin-lock-write-stage6.md`.

After the bounded `lock write` slice lands, the remaining follow-on work is:

1. `install`
2. `update`
3. `pin`
4. `lock apply`
5. `restart`
