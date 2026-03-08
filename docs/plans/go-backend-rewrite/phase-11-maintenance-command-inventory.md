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
- Go now also owns the plugin status/read slice:
  - `setta plugins list|rescan|restart-required` in `internal/settacmd`
  - shared plugin status/restart-required payload shaping in `internal/plugins`
- Go now also owns the plugin lifecycle-controls slice:
  - package-manager-aware discovery in `internal/plugins`
  - `setta plugins enable|disable|uninstall|rollback` in `internal/settacmd`
  - partial Python-entrypoint dispatch for those completed lifecycle controls
- Go now also owns the plugin authoring/local-link slice:
  - plugin template scaffolding and local folder validation in
    `internal/plugins`
  - `setta plugins init|validate|link` in `internal/settacmd`
  - partial Python-entrypoint dispatch for those completed authoring/local-link
    commands
- Go now also owns the plugin lockfile-write slice:
  - shared lockfile models and deterministic lockfile writing in
    `internal/plugins`
  - `setta plugins lock write` in `internal/settacmd`
  - nested Python-entrypoint dispatch for that completed lockfile-write
    subcommand
- Go now also owns the plugin source-acquisition/convergence slice:
  - production candidate-provider wiring in `internal/settacmd` into
    `internal/plugins`
  - thin `setta plugins install|update|pin` routing in `internal/settacmd`
  - thin `setta plugins lock apply` routing in `internal/settacmd`
  - selective Python-entrypoint dispatch for those completed subcommands
- Go now also owns the plugin restart slice:
  - shared restart response ownership in `internal/plugins`
  - thin `setta plugins restart` routing in `internal/settacmd`
  - selective Python-entrypoint dispatch for the completed restart subcommand
- Go already owns substantial plugin runtime and mutation foundations in:
  - `internal/plugins`
  - `internal/mcpx`
- Go now owns the whole packaged plugin command cluster in the shipped CLI

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
   - current plugin CLI surface spans:
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
   - Go now owns the first shipped plugin read/status slice:
     - `list`
     - `rescan`
     - `restart-required`
   - Go now also owns the lifecycle-controls slice:
     - package-manager-aware discovery
     - `enable`
     - `disable`
     - `uninstall`
     - `rollback`
   - Go now also owns the authoring/local-link slice:
     - `init`
     - `validate`
     - `link`
   - Go now owns the full packaged plugin CLI surface
   - Python still owns separate runtime/router restart callback behavior, but
     that is no longer a maintenance-command gap
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

Phase 11 Stage 3 is complete in
`phase-11-plugin-status-stage3.md`.

Phase 11 Stage 4 is now complete in
`phase-11-plugin-lifecycle-controls-stage4.md`.

Phase 11 Stage 5 is now complete in
`phase-11-plugin-authoring-and-local-link-stage5.md`.

Phase 11 Stage 6 is now planned in
`phase-11-plugin-lock-write-stage6.md`.

Phase 11 Stage 6 is now complete in
`phase-11-plugin-lock-write-stage6.md`.

Phase 11 Stage 7 is now complete in
`phase-11-plugin-source-acquisition-and-convergence-stage7.md`.

Phase 11 Stage 8 is now complete in
`phase-11-plugin-restart-stage8.md`.

There are no remaining Python-owned commands in the packaged maintenance
command inventory.

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
- 2026-03-08: added the dedicated plugin Stage 3 plan.
  - the next bounded slice is now explicitly `setta plugins
    list|rescan|restart-required`
  - partial top-level `plugins` dispatch is required because the remaining
    plugin mutations stay on Python for now
- 2026-03-08: completed the plugin Stage 3 slice.
  - `setta plugins list|rescan|restart-required` are now Go-owned
  - the remaining Python-owned maintenance surface is the plugin
    mutation/authoring cluster plus `plugins restart`
- 2026-03-08: added the dedicated plugin Stage 4 plan.
  - the next bounded slice is now package-manager discovery plus the lifecycle
    controls `enable`, `disable`, `uninstall`, and `rollback`
  - source acquisition, lockfiles, authoring, and restart-hook work remain
    explicitly out of scope for this stage
- 2026-03-08: completed the plugin Stage 4 slice.
  - `setta plugins enable|disable|uninstall|rollback` are now Go-owned
  - package-manager discovery is now Go-owned for the shipped plugin CLI
  - the only remaining Python-owned maintenance surface is the plugin
    source-acquisition, authoring, lockfile, and restart cluster
- 2026-03-08: added the dedicated plugin Stage 5 plan.
  - the next bounded slice is now explicitly `setta plugins init|validate|link`
  - remote install/update/pin and lockfile apply stay blocked on the missing
    production candidate-provider path
  - `plugins restart` stays separate until a later stage decides whether to
    keep it manual-only or land a real Go restart boundary
- 2026-03-08: completed the plugin Stage 5 slice.
  - `setta plugins init|validate|link` are now Go-owned
  - Go now owns local plugin template scaffolding, folder validation, local
    symlink install metadata, and PEP 440 Setta-version checks
  - the remaining Python-owned maintenance surface is now the plugin
    source-acquisition, lockfile, and restart cluster
- 2026-03-08: added the dedicated plugin Stage 6 plan.
  - the next bounded slice is now explicitly `setta plugins lock write`
  - remote install/update/pin and `lock apply` remain blocked on the missing
    production candidate-provider path
  - `plugins restart` still stays separate until a later stage scopes it
    intentionally
- 2026-03-08: completed the plugin Stage 6 slice.
  - `setta plugins lock write` is now Go-owned
  - Go now owns shared plugin lockfile writing over discovered plugin state and
    persisted install metadata
  - the remaining Python-owned plugin surface is `install`, `update`, `pin`,
    `lock apply`, and `restart`
- 2026-03-08: added the dedicated plugin Stage 7 plan.
  - the next bounded slice is now explicitly `install`, `update`, `pin`, and
    `lock apply`
  - the stage is centered on the missing production candidate-provider wiring
    plus shared lockfile convergence ownership
  - `plugins restart` remains intentionally separate
- 2026-03-08: completed the plugin Stage 7 slice.
  - `setta plugins install|update|pin|lock apply` are now Go-owned
  - the shipped Go CLI now wires the production candidate provider into the
    shared plugin service
  - the only remaining Python-owned plugin command is `plugins restart`
- 2026-03-08: added the dedicated plugin Stage 8 plan.
  - the final packaged plugin CLI gap is now explicitly `setta plugins
    restart`
  - the stage is scoped as a manual-only Go transport migration, not a new
    runtime restart-hook implementation
- 2026-03-08: completed the plugin Stage 8 slice.
  - `setta plugins restart` is now Go-owned in the shipped CLI
  - the packaged plugin command cluster is now fully Go-owned
  - Phase 11 no longer has Python-owned packaged maintenance commands in this
    inventory

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins ./internal/settacmd -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`
- `git diff --check`
