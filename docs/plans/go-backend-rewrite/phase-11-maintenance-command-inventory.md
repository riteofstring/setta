# Phase 11 Maintenance Command Inventory

## Purpose

This doc closes the post-Phase-10 CLI state after the completed Go-owned local
runtime command migration.

The goal is to record the remaining Python-owned maintenance/authoring commands
precisely, so future work does not reopen the completed runtime-command slices
under a vague "finish the CLI" label.

## Current Status

As of 2026-03-08:

- Go owns the shipped top-level `setta` routing boundary in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- Go owns the completed local runtime command cluster in:
  - `cmd/setta`
  - `cmd/setta-server`
  - `internal/launcher`
  - `internal/workspacelaunch`
  - `internal/deployments`
  - completed Go-owned default `setta`, `launch`, `share`, and `app`
- Go now also owns the first maintenance command slice:
  - `setta backups` in `internal/settacmd`
  - backup listing/restore semantics in `internal/projectbackup`
- Go now also owns the readable-export maintenance slice:
  - shared readable export in `internal/projectstate`
  - thin `setta export-db` routing in `internal/settacmd`
- Python still owns the remaining maintenance/authoring commands in
  `backend/setta/start.py`:
  - `plugins`
- Go already owns substantial plugin runtime and mutation foundations in:
  - `internal/plugins`
  - `internal/mcpx`
- Go does not yet own:
  - a shipped CLI boundary for `plugins`

## Inputs

- `docs/plans/go-backend-rewrite/phase-10-local-runtime-command-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-6-plugin-management-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-plugin-management-mutation-owner.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/project_state/readable_export.py`
- `backend/setta/project_state/session_project_manager.py`
- `tests/start/test_start_backups.py`
- `tests/start/test_start_plugins.py`
- `tests/project_state/test_readable_project_export.py`
- `internal/plugins/service.go`
- `internal/localsessions/registry.go`

## Ownership Inventory

1. The runtime-command migration is complete
   - Go now owns the shipped local runtime flows that actually start or reuse
     IDE/share/app sessions
   - the remaining Python commands are maintenance/authoring commands, not
     runtime blockers

2. `backups` was the smallest remaining shipped CLI slice, and it is now
   complete
   - current Python behavior is bounded and local-state only:
     - `backups list` sorts timestamped backup files newest-first, skips
       invalid backup filenames, and optionally emits JSON
     - `backups restore` requires exactly one selector from `--latest`,
       `--index`, or `--path`
     - restore refuses to run while a Setta session is active for the current
       workspace unless `--force` is passed
     - restore prompts unless `--yes` is passed, creates a
       `restore_stash_*.json` copy of the current project file, overwrites
       `project.json`, and prints a restart reminder
   - dependency shape is modest:
     - runtime path resolution already exists in Go
     - local session registry ownership already exists in Go
     - no long-lived backend runtime ownership is required for the command
   - landed Go ownership now covers:
     - backup filename parsing/listing rules
     - restore stash creation and overwrite helpers
     - shipped CLI text/JSON contract

3. `plugins` is a much larger CLI parity surface than the remaining command
   count suggests
   - current Python CLI surface spans:
     - authoring: `init`, `validate`, `link`
     - runtime state and mutation: `list`, `install`, `uninstall`, `enable`,
       `disable`, `rescan`, `update`, `pin`, `rollback`
     - lockfile flows: `lock write`, `lock apply`
     - restart UX: `restart`, `restart-required`
   - Go already owns important foundations in `internal/plugins`:
     - plugin store/state/history ownership
     - discovery and rescan
     - install, uninstall, update, and rollback mutation service methods
     - pending-restart bookkeeping
   - Go does not yet own several CLI-facing plugin behaviors:
     - template init and folder validation
     - local link workflow
     - enable/disable toggles
     - lockfile write/apply
     - restart/restart-required CLI payload shaping
   - rewrite implication:
     - plugin CLI parity should be its own dedicated slice, not bundled with
       `backups` or `export-db`

4. `export-db` is now complete
   - Go now owns the shared readable-export builder in `internal/projectstate`
   - Go now owns the shipped `setta export-db` CLI wrapper in
     `internal/settacmd`
   - Python still owns only the optional save-hook export path in
     `backend/setta/project_state/session_project_manager.py`
   - rewrite implication:
     - do not reopen readable export under a vague "finish maintenance
       commands" label unless the runtime save hook explicitly needs to move

## Working Decisions

- close the Phase 10 local runtime track; do not reopen it under a broad
  "finish the CLI" label
- treat the completed `backups` and `export-db` slices as closed
- keep `plugins` as the only remaining maintenance/authoring CLI slice
- keep readable export owned by `internal/projectstate`; do not fork a separate
  CLI-only exporter path
- keep `plugins` as a dedicated slice over `internal/plugins`, not as an
  opportunistic add-on to the already-completed maintenance work

## Recommended Landing Order

1. `plugins`
   - dedicated authoring/maintenance CLI parity slice with its own plan doc

## Recommended Next Step

Phase 11 Stage 2 is complete in
`phase-11-readable-export-foundation-stage2.md`.

The next bounded rewrite slice should be a dedicated `plugins` plan doc.

## Progress Notes

- 2026-03-08: created this inventory doc after the completed Phase 10 local
  runtime-command migration.
- 2026-03-08: recorded the next bounded maintenance-command landing order:
  `backups` first, shared readable-export foundation second, `plugins` last.
- 2026-03-08: completed the first maintenance-command slice.
  - `setta backups` is now Go-owned
  - the remaining Python-owned maintenance commands were `export-db` and
    `plugins`
- 2026-03-08: added the dedicated readable-export Stage 2 plan.
  - the next bounded slice is now explicitly the shared readable-export owner
    plus thin `setta export-db` routing
- 2026-03-08: completed the readable-export Stage 2 slice.
  - readable export and `setta export-db` are now Go-owned
  - the only remaining Python-owned maintenance command is `plugins`

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/settacmd -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`
- `git diff --check`
