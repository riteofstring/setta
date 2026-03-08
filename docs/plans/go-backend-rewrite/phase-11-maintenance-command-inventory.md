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
- Python still owns the remaining maintenance/authoring commands in
  `backend/setta/start.py`:
  - `backups`
  - `plugins`
  - `export-db`
- Go already owns substantial plugin runtime and mutation foundations in:
  - `internal/plugins`
  - `internal/mcpx`
- Go does not yet own:
  - a shipped CLI boundary for the remaining maintenance commands
  - a shared readable project export builder matching
    `backend/setta/project_state/readable_export.py`

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

2. `backups` is the smallest remaining shipped CLI slice
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
   - missing Go ownership is still real:
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

4. `export-db` is a small CLI entrypoint over a not-yet-ported semantic owner
   - the current Python command itself is thin:
     - load the current project
     - build the readable export payload
     - YAML-serialize it
     - write `setta_files/project.readable.yaml` or a custom output path
   - the product semantics live in
     `backend/setta/project_state/readable_export.py`, not in the CLI wrapper
   - the same readable-export builder is also used on project save in
     `backend/setta/project_state/session_project_manager.py`
   - rewrite implication:
     - do not port `export-db` as a one-off CLI serializer
     - first add a shared Go readable-export owner for project-state export
       structure, then hang the CLI command off that owner

## Working Decisions

- close the Phase 10 local runtime track; do not reopen it under a broad
  "finish the CLI" label
- treat the remaining Python-owned `backups`, `plugins`, and `export-db`
  commands as a separate maintenance/authoring track
- if another shipped CLI migration slice is needed, start with `backups`
  because it is the smallest bounded command with the least missing product
  runtime ownership
- keep `export-db` behind a shared readable-export foundation; do not build a
  CLI-only Go exporter
- keep `plugins` as a later dedicated slice over `internal/plugins`, not as an
  opportunistic add-on to `backups`

## Recommended Landing Order

1. `backups`
   - bounded local-state command
   - minimal dependency surface beyond existing Go path/session ownership
2. readable export foundation for `export-db`
   - shared project-state export owner first
   - CLI wrapper only after that owner exists
3. `plugins`
   - dedicated authoring/maintenance CLI parity slice with its own plan doc

## Recommended Next Step

If product priorities require another shipped CLI migration slice, start with a
focused Stage 1 plan for `setta backups` only.

That slice should cover:

1. `setta backups list`
2. `setta backups restore`
3. Go-owned text and JSON output contracts
4. explicit active-session refusal over the Go local session registry
5. restore-stash creation and overwrite behavior

Do not combine that first maintenance slice with `plugins` or `export-db`
unless a concrete dependency forces it.

## Progress Notes

- 2026-03-08: created this inventory doc after the completed Phase 10 local
  runtime-command migration.
- 2026-03-08: recorded the next bounded maintenance-command landing order:
  `backups` first, shared readable-export foundation second, `plugins` last.

## Verification

- docs-only update; runtime tests not needed
- `git diff --check`
