# Phase 11 Plugin Lock Write Stage 6

## Purpose

This doc scopes the sixth bounded Phase 11 implementation slice after the
completed plugin authoring/local-link migration.

The goal is to move the unblocked lockfile-observation command onto the shipped
Go CLI without broadening into the still-blocked remote source-acquisition,
lockfile-apply, or restart-hook work.

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
- Go already owns the completed plugin authoring/local-link slice:
  - `init`
  - `validate`
  - `link`
- Go now also owns the completed lockfile-write slice in:
  - `internal/plugins`
  - `internal/settacmd/plugins.go`
  - `backend/setta/entrypoint.py`
- Python now owns the remaining plugin commands:
  - `install`
  - `update`
  - `pin`
  - `lock apply`
  - `restart`

## Inputs

- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/plans/go-backend-rewrite/phase-11-plugin-authoring-and-local-link-stage5.md`
- `docs/plans/go-backend-rewrite/phase-6-plugin-management-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-plugin-management-mutation-owner.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/errors.py`
- `backend/setta/plugins/models.py`
- `tests/start/test_start_plugins.py`
- `tests/start/test_module_entrypoint.py`
- `tests/plugins/test_plugin_manager.py`
- `internal/plugins/discovery.go`
- `internal/plugins/service.go`
- `internal/plugins/store.go`
- `internal/settacmd/plugins.go`

## Problem Shape

The remaining plugin CLI work still does not form one coherent implementation
slice.

There are three distinct dependency groups:

1. lockfile observation
   - `lock write`
2. remote source acquisition plus convergence
   - `install`
   - `update`
   - `pin`
   - `lock apply`
3. restart UX
   - `restart`

Only the first group is currently unblocked.

`lock write` only depends on discovered plugin state plus persisted install
metadata. Go already owns both of those sources of truth in `internal/plugins`.

The second group is still blocked on one missing production dependency:

- a real Go-owned candidate provider for remote plugin source acquisition

Go already has a mutation-service interface for candidate resolution, but the
shipped app does not wire a production provider into `internal/plugins`.
Porting `install`, `update`, `pin`, or `lock apply` now would either fail in
the shipped runtime or require a temporary compatibility fallback back into
Python.

`restart` is also separate:

- current Go-owned status payloads already report the manual/programmatic
  restart capability accurately
- the shipped local runtime still only exposes the manual capability path
  (`Programmatic restart is not available in this runtime.`)
- a CLI transport for `plugins restart` should not land unless this stage is
  intentionally scoped as a manual-only UX command or a later stage lands a
  real restart hook

That makes `lock write` the highest-leverage next step.

## Scope

This stage should cover only:

- Go-owned lockfile models and persistence helpers in `internal/plugins`
- Go-owned `write lockfile` semantics in `internal/plugins`
  - rescan-backed source of truth
  - deterministic ordering
  - exclusion of shadowed entries
  - exclusion of package-manager-managed entries
  - inclusion of install metadata when present
- thin Go CLI transport for:
  - `setta plugins lock write`
- selective Python entrypoint dispatch for only that completed nested
  subcommand

Do not include:

- `plugins install`
- `plugins update`
- `plugins pin`
- `plugins lock apply`
- `plugins restart`
- programmatic restart-hook ownership
- production candidate-provider wiring

## Working Decisions

- keep `lock write` separate from `lock apply`
  - writing a lockfile is a read/serialization flow over already-owned data
  - applying a lockfile is a mutation flow that still depends on blocked
    source-acquisition work
- keep transport thin
  - `internal/settacmd` should only parse nested lock arguments, render text or
    JSON, and call an explicit plugin-service method
- preserve Python output shape
  - write to `<workspace>/.setta_plugins/plugins.lock.json`
  - return `lockfilePath` plus `pluginCount`
- use discovery as the source of truth
  - do not infer installed plugins from filesystem layout or metadata alone
  - use persisted install metadata only to enrich source-spec and installer
    fields when available

## Implementation Shape

1. add lockfile ownership in `internal/plugins`
   - lockfile types
   - lockfile path owner on the store
   - service method for `WriteLockfile`
2. extend `internal/settacmd/plugins.go`
   - nested `plugins lock write` parsing
   - text and JSON output parity
3. update the shipped Python entrypoint
   - dispatch only `plugins lock write` to Go
   - keep `plugins lock apply` on Python
4. update active docs
   - record the narrower remaining plugin surface precisely

## Test Strategy

- add focused `internal/plugins` tests for:
  - lockfile write with linked/local plugins
  - exclusion of shadowed entries
  - exclusion of package-manager-managed entries
  - persistence of install metadata fields into lockfile entries
- add focused `internal/settacmd` tests for:
  - `plugins lock write` text output
  - `plugins lock write --json`
  - nested `plugins lock` command validation
- extend `tests/start/test_module_entrypoint.py`
  - route only `plugins lock write` to Go
  - keep `plugins lock apply` on Python

## Explicit Non-Goals

- remote plugin install/update/pin
- lockfile apply/convergence
- Go-owned programmatic restart
- app/runtime wiring of a production candidate provider

## Open Questions

- whether the next stage should first land the production candidate provider, or
  whether `plugins restart` should be split into a manual-only CLI slice before
  that dependency work
- whether `lock apply` should stay bundled with install/update/pin after the
  candidate-provider stage, or be split again as a separate convergence slice

## Progress Notes

- 2026-03-08: created this Stage 6 plan to keep the remaining plugin CLI work
  split along real dependency boundaries.
  - `lock write` is the first unblocked lockfile slice
  - remote source acquisition plus `lock apply` remain blocked on the missing
    production candidate-provider path
  - `plugins restart` remains separate until a later stage decides whether it
    stays manual-only or gains a real restart hook
- 2026-03-08: completed the Stage 6 slice.
  - `setta plugins lock write` now routes through the shipped Go CLI
  - Go now owns shared plugin lockfile models, deterministic lockfile writing,
    and nested entrypoint dispatch for `plugins lock write`
  - package-manager-managed entries and shadowed entries are now excluded by
    the Go-owned lockfile writer, matching the current Python behavior
  - the remaining Python-owned plugin surface is now `install`, `update`,
    `pin`, `lock apply`, and `restart`

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins ./internal/settacmd -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`
- `git diff --check`

## Recommended Next Step

The follow-on plan for the still-blocked plugin source-acquisition and
convergence surface now lives in
`phase-11-plugin-source-acquisition-and-convergence-stage7.md`:

1. `install`
2. `update`
3. `pin`
4. `lock apply`

Keep `plugins restart` separate unless that stage also lands a real Go restart
hook or explicitly scopes a manual-only CLI transport.
