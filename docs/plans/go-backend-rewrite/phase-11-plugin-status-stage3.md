# Phase 11 Plugin Status Stage 3

## Purpose

This doc scopes the third bounded Phase 11 implementation slice after the
completed readable-export migration.

The goal is to move the read/status portion of `setta plugins` onto the shipped
Go CLI without forcing the entire plugin authoring and mutation surface into the
same change.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- Go already owns the plugin discovery and pending-restart foundations in:
  - `internal/plugins/discovery.go`
  - `internal/plugins/service.go`
  - `internal/plugins/store.go`
- this stage is now complete:
  - `setta plugins list`
  - `setta plugins rescan`
  - `setta plugins restart-required`
  - partial `plugins` dispatch in `backend/setta/entrypoint.py`
- Python still owns the remaining `plugins` commands in:
  - `backend/setta/start.py`
  - `init`, `validate`, `install`, `link`, `uninstall`, `enable`, `disable`,
    `update`, `pin`, `rollback`, `lock`, and `restart`

## Inputs

- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/models.py`
- `tests/start/test_start_plugins.py`
- `tests/start/test_module_entrypoint.py`
- `backend/setta/entrypoint.py`
- `internal/plugins/discovery.go`
- `internal/plugins/service.go`
- `internal/plugins/store.go`
- `internal/plugins/types.go`
- `internal/settacmd/cli.go`

## Problem Shape

`plugins` is the only remaining Python-owned maintenance command family, but it
is too large to migrate as one undifferentiated slice.

The smallest high-leverage shipped CLI gap is the read/status cluster:

1. `plugins list`
2. `plugins rescan`
3. `plugins restart-required`

Those commands already sit mostly on Go-owned foundations:

1. plugin discovery ordering and state resolution
2. pending-restart bookkeeping
3. source-of-truth plugin state files

The main migration wrinkle is dispatch shape:

1. `backend/setta/entrypoint.py` currently dispatches to Go by top-level token
2. `plugins` is still only partially Go-owned after this stage
3. the entrypoint therefore must dispatch only the completed plugin
   subcommands to Go and leave the remaining subcommands in Python

## Scope

This stage should cover only:

- Go-owned `setta plugins list`
- Go-owned `setta plugins rescan`
- Go-owned `setta plugins restart-required`
- selective Python entrypoint dispatch for only those completed plugin
  subcommands
- a bounded Go status/read payload owner over the existing discovery service

Do not include:

- `plugins restart`
- `plugins install`, `update`, `pin`, `rollback`, `uninstall`
- `plugins enable`, `disable`, `link`
- `plugins init`, `validate`
- `plugins lock write`, `plugins lock apply`

## Working Decisions

- keep the slice bounded to read/status commands
  - do not broaden into plugin mutations just because they share the same
    top-level token
- keep transport thin
  - `internal/settacmd` should parse subcommands, flags, and text/JSON output
    only
- use Go plugin discovery as the source of truth
  - do not recreate Python plugin-manager state tracking in `internal/settacmd`
- add a dedicated Go status/read owner where needed
  - list/status payload shaping belongs with plugin semantics, not the CLI
- keep restart capability truthful
  - until Go owns a real runtime restart hook, `restart-required` should expose
    only the manual restart capability
- stage partial dispatch explicitly
  - route only the completed `plugins` subcommands to Go
  - leave the remaining `plugins` subcommands on the Python path

## Implementation Shape

1. add bounded Go plugin status/read helpers
   - list/status payload entries over `DiscoveredPlugin`
   - restart-capability payload for `restart-required`
   - pending-restart IDs plus pending IDs without discovered status entries
2. add `plugins` routing in `internal/settacmd`
   - `list`
   - `rescan`
   - `restart-required`
3. update the shipped Python entrypoint
   - dispatch only those plugin subcommands to the packaged Go binary
   - keep the rest of `plugins` on Python
4. update active docs
   - record partial `plugins` ownership precisely
   - identify the remaining Python-owned plugin mutations explicitly

## Test Strategy

- add focused Go tests for plugin status/read helpers:
  - ordered plugin list output
  - pending-restart removed-plugin tombstones
  - manual restart capability payload
  - pending IDs without status entries
- add focused `internal/settacmd` tests for:
  - `plugins list` JSON/text output
  - `plugins rescan --json`
  - `plugins restart-required` text and JSON output
  - manager/service initialization and state-load errors
- extend `tests/start/test_module_entrypoint.py` so only completed
  `plugins` subcommands dispatch to Go

## Explicit Non-Goals

- full `plugins` parity in one stage
- Go runtime restart acceptance/rejection flows
- plugin mutation ownership beyond the completed read/status slice
- preserving Python Click internals as the contract source of truth

## Open Questions

- whether the next plugin slice should be `restart` or the mutation cluster;
  this stage intentionally leaves that decision open

## Progress Notes

- 2026-03-08: created this Stage 3 plan to keep the remaining `plugins` work
  bounded around the shipped read/status surface first.
- 2026-03-08: completed this Stage 3 slice.
  - `setta plugins list`, `setta plugins rescan`, and
    `setta plugins restart-required` now route through the shipped Go CLI
  - plugin status/restart-required payload shaping now lives in
    `internal/plugins`
  - `backend/setta/entrypoint.py` now dispatches only those completed
    `plugins` subcommands to Go

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins ./internal/settacmd -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`
- `git diff --check`

## Recommended Next Step

Move to the remaining `plugins` surface with a new bounded plan:

1. mutation/authoring commands (`install`, `link`, `uninstall`, `update`,
   `pin`, `rollback`, `enable`, `disable`, `lock`)
2. keep `restart` separate unless that slice also lands a real Go restart hook
