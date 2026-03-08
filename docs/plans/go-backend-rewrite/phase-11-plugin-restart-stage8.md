# Phase 11 Plugin Restart Stage 8

## Purpose

This doc scopes the eighth bounded Phase 11 implementation slice after the
completed plugin source-acquisition and lockfile-convergence migration.

The goal is to close the last shipped plugin CLI ownership gap by moving
`setta plugins restart` onto the Go CLI without broadening into runtime-router
restart-hook work.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- Go already owns the completed plugin CLI slices for:
  - `list`
  - `rescan`
  - `restart-required`
  - `enable`
  - `disable`
  - `uninstall`
  - `rollback`
  - `init`
  - `validate`
  - `link`
  - `install`
  - `update`
  - `pin`
  - `lock write`
  - `lock apply`
- Python still owns only the remaining packaged CLI plugin command:
  - `restart`
- Python runtime/router code still owns the only live programmatic restart
  callback boundary:
  - `PluginManager(restart_callback=...)`
  - API route handling under the Python server runtime
- the packaged CLI path does not currently provide a restart callback at all
  - `_build_plugin_manager_for_cli()` constructs `PluginManager(...)` without
    `restart_callback`
  - `python -m setta plugins restart` is therefore already manual-only in the
    shipped CLI path, even though the Python manager supports programmatic
    restart in router tests

## Inputs

- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/plans/go-backend-rewrite/phase-11-plugin-source-acquisition-and-convergence-stage7.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/entrypoint.py`
- `backend/setta/plugins/manager.py`
- `tests/start/test_start_plugins.py`
- `tests/start/test_module_entrypoint.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/routers/test_plugin_routes.py`
- `internal/plugins/status.go`
- `internal/settacmd/plugins.go`
- `internal/settacmd/plugins_test.go`

## Problem Shape

`plugins restart` looks like a restart-hook command, but the shipped CLI path
does not actually own a restart hook today.

1. the packaged CLI behavior is already manual-only
   - Python `plugins restart` calls `manager.restart_backend()`
   - the CLI manager builder never injects `restart_callback`
   - that means the packaged CLI currently returns:
     - `accepted=false`
     - `mode=manual`
     - `command=setta`
     - `reason=Programmatic restart is not available in this runtime.`

2. programmatic restart still belongs to the Python server runtime, not the
   packaged maintenance CLI
   - plugin API/router tests cover callback-accepted, callback-rejected, and
     callback-failure behavior
   - moving those router/runtime semantics into this CLI slice would broaden
     scope past the actual remaining packaged command gap

3. the remaining ownership work is therefore just a thin transport migration
   - Go already exposes truthful restart capability through
     `restart-required`
   - the last missing piece is a Go-owned command that renders the same
     manual-only response payload/text contract as the current packaged CLI

## Scope

This stage should cover only:

- a shared Go-owned restart response type/method in `internal/plugins`
- thin Go CLI transport for `setta plugins restart`
- Python module entrypoint dispatch for the completed `plugins restart`
  subcommand
- focused Go and entrypoint tests for the shipped CLI behavior
- doc updates that mark the plugin CLI migration complete

Do not include:

- Python API route migration for programmatic restart
- a new Go runtime restart hook
- launcher/share/app restart integration
- changes to `restart-required` semantics
- plugin runtime/router parity beyond the packaged CLI command

## Working Decisions

- keep this slice manual-only for the packaged CLI
  - that matches the real current shipped behavior
  - do not invent a fake restart hook just to claim full parity
- keep transport thin
  - the CLI should parse flags, call a shared service method, and render text
    or JSON
- keep the source of truth in `internal/plugins`
  - do not inline capability logic in `internal/settacmd`
- leave Python router/runtime restart callback behavior untouched
  - that is a separate runtime concern, not a maintenance-command gap

## Implementation Shape

1. add shared restart response ownership in `internal/plugins`
   - add a typed restart result payload
   - add a service method that resolves the current restart capability and
     returns the shipped CLI response payload

2. extend the shipped Go CLI
   - add `plugins restart` parsing/output in `internal/settacmd/plugins.go`
   - preserve the current manual-only text/JSON contract

3. update the Python module entrypoint dispatch
   - route `plugins restart` to Go

## Test Strategy

- add focused `internal/settacmd` tests for:
  - `plugins restart --json`
  - `plugins restart` text output for the shipped manual-only case
- extend `tests/start/test_module_entrypoint.py`
  - route `plugins restart` to Go
- keep existing Python manager/router restart tests as reference coverage for
  runtime-only programmatic restart behavior

## Explicit Non-Goals

- new restart callback plumbing in Go
- parity for Python router programmatic restart acceptance/rejection
- plugin API route migration
- non-CLI runtime restart orchestration

## Open Questions

- whether a later non-CLI slice should introduce an explicit Go restart-hook
  boundary for local runtime control, or leave programmatic restart entirely in
  the Python server runtime

## Progress Notes

- 2026-03-08: created this Stage 8 plan to isolate the last plugin CLI command
  from the already-completed Stage 7 source-acquisition/convergence work.
  - the packaged CLI behavior is already manual-only
  - the bounded migration target is therefore `plugins restart` transport
    ownership, not runtime-hook parity

## Recommended Next Step

Implement the manual-only `plugins restart` Go CLI handoff:

1. add the shared restart result/method in `internal/plugins`
2. expose `setta plugins restart` through `internal/settacmd`
3. route the module entrypoint to Go
4. update the Phase 11 docs to mark the plugin CLI migration complete
