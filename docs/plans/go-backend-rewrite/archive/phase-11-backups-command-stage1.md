# Phase 11 Backups Command Stage 1

## Purpose

This doc scopes the first bounded Phase 11 implementation slice after the
completed maintenance-command inventory.

The goal is to move `setta backups` onto the shipped Go-owned CLI without
pulling `plugins` or `export-db` into the same change.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- Go already owns runtime path resolution and local session registry
  foundations in:
  - `internal/config`
  - `internal/localsessions`
- this stage is now complete:
  - `cmd/setta` / `internal/settacmd` now own `setta backups list|restore`
  - `internal/projectbackup` now owns backup-file listing, restore selection,
    and restore-stash behavior
  - the shipped Python entrypoint now dispatches `backups` to the packaged Go
    binary
- the existing Python tests document the reference behavior in:
  - `tests/start/test_start_backups.py`
  - `tests/database/test_backup.py`

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-11-maintenance-command-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/database/backup.py`
- `tests/start/test_start_backups.py`
- `tests/database/test_backup.py`
- `tests/start/test_module_entrypoint.py`
- `backend/setta/entrypoint.py`
- `internal/config/config.go`
- `internal/localsessions/registry.go`
- `internal/settacmd/cli.go`

## Problem Shape

The remaining gap is not runtime path ownership or session metadata ownership.
Those already exist in Go.

The gap is the shipped `setta backups` command contract:

1. listing valid backup files in descending timestamp order
2. parsing timestamped backup filenames deterministically
3. restoring a selected backup onto `project.json`
4. creating a restore stash before overwrite
5. refusing restore while an IDE session for the current workspace is active
   unless `--force` is passed
6. dispatching packaged `setta backups ...` to the Go binary instead of Python

## Scope

This stage should cover only:

- `setta backups list`
- `setta backups restore`
- thin dispatch from the shipped Python entrypoint to Go
- a dedicated Go owner for backup file listing, selection, and restore-stash
  behavior

Do not include:

- auto-backup creation during project saves
- `plugins`
- `export-db`
- launcher/runtime command changes

## Working Decisions

- keep `cmd/setta` thin
  - parse `setta backups` flags and delegate backup semantics to a dedicated Go
    owner
- keep backup semantics out of the transport layer
  - backup filename parsing, listing, selection, and restore-stash creation
    should live outside `internal/settacmd`
- use Go runtime paths as the source of truth
  - resolve workspace/setta_files/runtime roots through `internal/config`
  - do not duplicate Python path/global-state helpers
- use the Go local session registry as the source of truth for restore refusal
  - refuse restore when the current workspace has active local sessions unless
    `--force` is passed
- preserve the shipped CLI contract where it matters
  - `list --json`
  - `list --limit`
  - exactly one restore selector
  - restore stash naming under `setta_files/backups`

## Implementation Shape

1. add a dedicated Go backup owner
   - valid backup filename parsing
   - descending backup listing
   - restore selector resolution
   - restore-stash creation and project overwrite helpers
2. add `backups` routing in `internal/settacmd`
   - `list`
   - `restore`
   - thin CLI error/output shaping only
3. update the shipped Python entrypoint
   - dispatch `setta backups ...` to the packaged Go binary
4. update active docs
   - mark `backups` as Go-owned
   - record the remaining Python-owned maintenance commands precisely

## Test Strategy

- add focused Go tests for the backup owner:
  - valid/invalid filename filtering
  - descending sort order
  - restore-stash creation
  - restore selector validation
- add focused `internal/settacmd` tests for:
  - `backups list` JSON/text output
  - `--limit` validation
  - restore selector conflicts and range validation
  - active-session refusal and `--force` bypass
  - restore overwrite and stash behavior
- extend `tests/start/test_module_entrypoint.py` so `python -m setta backups`
  dispatches to Go

## Explicit Non-Goals

- auto-backup creation during save flows
- moving `plugins`
- moving `export-db`
- preserving Python Click help text as the command source of truth

## Open Questions

- none for this stage; the remaining work is outside `setta backups`

## Progress Notes

- 2026-03-08: completed this Stage 1 slice.
  - `setta backups list` and `setta backups restore` now route through the
    shipped Go CLI
  - backup filename parsing, descending listing, restore selection, and
    restore-stash creation now live in `internal/projectbackup`
  - restore now uses the Go local session registry plus active-session
    filtering before overwrite
  - `python -m setta backups ...` now dispatches to Go

## Verification

- `git diff --check`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectbackup ./internal/localsessions ./internal/settacli ./internal/settacmd -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`

## Recommended Next Step

Move to the remaining maintenance commands:

1. readable export foundation for `export-db`
2. `plugins`
