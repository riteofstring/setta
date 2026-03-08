# Phase 11 Plugin Lifecycle Controls Stage 4

## Purpose

This doc scopes the fourth bounded Phase 11 implementation slice after the
completed plugin status/read migration.

The goal is to move the lifecycle controls that operate on already-discovered
plugins onto the shipped Go CLI without pulling source acquisition, authoring,
or restart-hook work into the same change.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- Go already owns the completed plugin status/read slice in:
  - `internal/plugins/status.go`
  - `internal/settacmd/plugins.go`
- Go already owns Setta-managed plugin mutation foundations in:
  - `internal/plugins/service.go`
  - `internal/plugins/store.go`
  - `internal/plugins/source_specs.go`
- Python still owns the remaining `plugins` mutation/authoring commands in:
  - `backend/setta/start.py`
- the next bounded stage should move only:
  - `setta plugins enable`
  - `setta plugins disable`
  - `setta plugins uninstall`
  - `setta plugins rollback`

## Inputs

- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/plans/go-backend-rewrite/phase-11-plugin-status-stage3.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/models.py`
- `tests/start/test_start_plugins.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/start/test_module_entrypoint.py`
- `internal/plugins/discovery.go`
- `internal/plugins/service.go`
- `internal/plugins/store.go`
- `internal/plugins/status.go`
- `internal/pythonenv/runtime.go`
- `internal/settacmd/plugins.go`

## Problem Shape

The remaining `plugins` surface is not blocked only by CLI transport.

The next shipped lifecycle controls depend on one missing source-of-truth
runtime owner in Go:

1. package-manager discovery for plugins installed in the active Python
   environment

That dependency matters because Python lifecycle behavior already treats
package-manager-discovered plugins as first-class discovered entries:

1. they can win precedence over global Setta-managed plugins
2. `enable` / `disable` operate on the highest-precedence discovered entry
3. `uninstall` / `update` reject package-manager-managed entries explicitly as
   externally managed instead of pretending they do not exist
4. lockfile flows later need the same distinction

Without package-manager discovery in Go, moving lifecycle controls now would
either regress externally managed plugin handling or silently ignore a
source-of-truth discovery path that already exists.

## Scope

This stage should cover only:

- Go-owned package-manager discovery in `internal/plugins`
- Go-owned `enable` / `disable` lifecycle service methods
- thin Go CLI transport for:
  - `setta plugins enable`
  - `setta plugins disable`
  - `setta plugins uninstall`
  - `setta plugins rollback`
- selective Python entrypoint dispatch for those completed subcommands

Do not include:

- `plugins install`
- `plugins update`
- `plugins pin`
- `plugins link`
- `plugins lock write`
- `plugins lock apply`
- `plugins init`
- `plugins validate`
- `plugins restart`
- remote candidate-provider work

## Working Decisions

- treat package-manager discovery as a required dependency, not a future
  polish item
  - do not ship lifecycle-control ports that silently miss environment-managed
    plugins
- use the active Python environment as the source of truth
  - build package-manager discovery over `importlib.metadata`
  - keep the Go owner explicit and narrow; do not recreate the Python manager
    singleton
- keep transport thin
  - `internal/settacmd` should parse flags, shape text/JSON output, and call
    explicit service methods only
- keep restart-hook work out of scope
  - backend restart acceptance/rejection stays on the Python-owned
    `plugins restart` command until Go owns a real restart boundary
- keep source acquisition out of scope
  - `install` / `update` / `pin` remain blocked on a production candidate
    provider and should not be mixed into this stage

## Implementation Shape

1. add package-manager discovery ownership in `internal/plugins`
   - inspect the active Python environment via `importlib.metadata`
   - surface manifest-bearing distributions as `package_manager` entries in
     `setta_files` scope
   - preserve precedence with existing Setta-managed plugin roots
2. add lifecycle service methods in `internal/plugins`
   - `Enable`
   - `Disable`
   - reuse existing `Uninstall`
   - reuse existing `Rollback`
3. extend `internal/settacmd/plugins.go`
   - CLI flag parsing and output shaping for `enable`, `disable`, `uninstall`,
     and `rollback`
4. update the shipped Python entrypoint
   - dispatch only the completed lifecycle-control subcommands to Go
5. update active docs
   - record partial `plugins` ownership precisely

## Test Strategy

- add focused Go tests for package-manager discovery:
  - valid plugin distribution discovery
  - package-manager precedence vs Setta-managed roots
  - invalid manifest and ambiguous plugin-root visibility
- add focused Go tests for lifecycle service methods:
  - enablement source transitions
  - backend pending-restart behavior
  - package-manager uninstall rejection
  - multi-scope uninstall scope requirement
- add focused `internal/settacmd` tests for:
  - `enable` / `disable` JSON and text output
  - `uninstall` / `rollback` JSON and text output
  - scope-selector validation and error shaping
- extend `tests/start/test_module_entrypoint.py` so only the completed
  lifecycle-control subcommands dispatch to Go

## Explicit Non-Goals

- remote plugin install/update transport
- local link workflow
- lockfile convergence
- template init/validate authoring flows
- Go-owned programmatic plugin restart

## Open Questions

- whether the later source-acquisition slice should land `link` before remote
  provider-backed `install` / `update`, or whether both should move together
  once backend-runtime preparation is ready

## Progress Notes

- 2026-03-08: created this Stage 4 plan to keep the remaining plugin mutation
  work bounded around package-manager-aware lifecycle controls first.

## Verification

- `git diff --check`

## Recommended Next Step

Implement this Stage 4 slice:

1. package-manager discovery in `internal/plugins`
2. Go-owned `enable` / `disable` / `uninstall` / `rollback`
