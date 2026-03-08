# Phase 10 Local Runtime Command Cluster Plan

## Purpose

This doc scopes the next rewrite track after the completed Phase 9 distribution
work.

The goal is to move the remaining high-leverage local runtime commands onto the
Go-owned shipped `setta` contract without reopening unrelated maintenance
commands or recreating the old Click tree.

## Current Status

As of 2026-03-08:

- Go already owns the backend runtime executable and mode wiring in:
  - `cmd/setta-server`
  - `internal/app`
  - `internal/config`
  - `cmd/setta-server/local_session.go`
- Go already owns the shipped entrypoint router plus helper/launcher commands
  in:
  - `cmd/setta`
  - `internal/settacmd`
  - `internal/settacli`
- Go already owns the local session-launch primitives needed for local CLI
  runtime commands in:
  - `internal/launcher/session_launcher.go`
  - `internal/workspacelaunch`
- Python still owns the remaining local command groups in
  `backend/setta/start.py`:
  - default `setta` local IDE server start
  - `share`
  - `app`
  - `backups`
  - `plugins`
  - `export-db`
- Go now owns the first local-runtime command in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
  - Go-owned `setta launch` local session bootstrap dispatch

## Inputs

- `docs/plans/go-backend-rewrite/phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- `docs/plans/go-backend-rewrite/phase-9-native-installer-bundled-package-stage2.md`
- `docs/plans/go-backend-rewrite/phase-10-default-local-ide-start-stage2.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `tests/start/test_launch.py`
- `tests/start/test_start_backups.py`
- `tests/start/test_start_plugins.py`
- `cmd/setta-server/main.go`
- `cmd/setta-server/local_session.go`
- `internal/config/config.go`
- `internal/launcher/session_launcher.go`
- `internal/launcher/session_launcher_test.go`
- `internal/workspacelaunch/local_launch.go`
- `internal/settacmd/cli.go`

## Problem Shape

The remaining local Python command surface is not one coherent migration unit.

There are two clearly different clusters:

1. local runtime commands
   - default `setta`
   - `share`
   - `app`
   - `launch`
   - these mostly orchestrate already-Go-owned runtime/session/deployment
     boundaries

2. maintenance/authoring commands
   - `backups`
   - `plugins`
   - `export-db`
   - these are not distribution blockers and have their own storage/runtime
     concerns

The highest-leverage next rewrite slice is the local runtime cluster, not broad
"finish the CLI" work.

## Boundary Choice

Phase 10 should cover only:

- `setta launch`
- default `setta` local IDE server start
- `setta share`
- `setta app`

Do not include:

- `backups`
- `plugins`
- `export-db`

Those commands should remain explicitly Python-owned until a later separate
slice is justified.

## Working Decisions

- keep `cmd/setta` as the user-facing command router
  - do not move user-facing local-runtime command parsing into
    `cmd/setta-server`
- keep `cmd/setta-server` as the backend runtime executable
  - for long-lived server commands, prefer explicit execution of the sibling
    server binary over inlining the whole backend runtime into `cmd/setta`
- use existing Go launch primitives instead of reimplementing Python process
  orchestration
  - `setta launch` should reuse `internal/launcher.LocalIDESessionLauncher`
  - do not route CLI `launch` through launcher-home-only allowed-root policy
    from `internal/launcher.OpenWorkspaceService`
- do not bundle maintenance commands into this phase
  - `backups`, `plugins`, and `export-db` do not unblock the shipped runtime
    command story
- do not spend the first slice recreating Python `--reload`
  - reload is already handled by dev scripts
  - a Go rewrite of the shipped local-runtime CLI does not need to preserve
    Uvicorn-style reload semantics by default

## Recommended Landing Order

1. port `setta launch` local-mode ownership to Go
   - smallest bounded command in the remaining local-runtime cluster
   - directly reuses `internal/launcher.LocalIDESessionLauncher`
   - proves packaged `cmd/setta` can start or reuse sibling `cmd/setta-server`
     sessions for non-launcher workflows
2. port default `setta` local IDE start
   - explicit long-lived IDE server start over the already-completed Go backend
     runtime
3. port `share` and `app`
   - explicit deployment-root/deployment-mode routing over completed Go
     deployment runtime owners
4. only after that, decide whether maintenance commands should move at all

## Recommended First Implementation Slice

Start with `setta launch`, not default `setta`.

That slice should:

1. add `launch` routing to `cmd/setta` / `internal/settacmd`
2. resolve the sibling `setta-server` executable deterministically, matching the
   launcher/runtime packaging boundary
3. use `internal/launcher.LocalIDESessionLauncher` to:
   - normalize runtime paths
   - reuse connectable IDE sessions
   - start a new `setta-server` process when needed
4. emit the Go-owned JSON payload for:
   - bootstrap URL fragment
   - resolved runtime paths
   - session id
   - startedNew
   - session metadata
5. keep scope explicit
   - local-only `launch`
   - no SSH launch behavior in this slice
   - no browser auto-open behavior in this slice

## Test Strategy For The First Slice

- add focused `internal/settacmd` tests for:
  - command routing
  - conflicting global/subcommand path flags
  - JSON payload shape
  - executable-resolution failures
- extend or replace the current module-entrypoint dispatch tests so `launch`
  routes to Go once the slice lands
- reuse `internal/launcher/session_launcher_test.go` and
  `cmd/setta-server/local_session_test.go` as lower-level references rather
  than rebuilding launch process heuristics in the CLI layer

## Explicit Non-Goals

- remote launch parity
- plugin/backups/export-db migration
- recreating Python helper internals inside Go
- broad Click-tree shape preservation
- reintroducing implicit global state ownership into the Go CLI layer

## Progress Notes

- 2026-03-08: created this plan after the completed Phase 9 distribution work.
  The next rewrite step is now explicitly the local runtime command cluster,
  not generic CLI parity.
- 2026-03-08: decision recorded.
  - the next bounded implementation slice should be Go-owned `setta launch`
  - `backups`, `plugins`, and `export-db` stay out of scope for now
- 2026-03-08: completed the first bounded implementation slice.
  - `setta launch` now routes through `cmd/setta` / `internal/settacmd`
  - the thin Python wrapper now dispatches `launch` to the packaged Go binary
  - Go now owns the local launch JSON/error contract for packaged installs
- 2026-03-08: added the focused Stage 2 plan for the next bounded slice.
  - default no-subcommand `setta` local IDE start now has an explicit
    implementation boundary over the sibling `setta-server` runtime
  - `--reload` is explicitly out of scope for the shipped Go CLI slice

## Open Questions

- none for the completed `launch` slice; the remaining work is sequencing, not
  architecture uncertainty

## Verification

- docs-only update; runtime tests not needed
- `git diff --check`

## Recommended Next Step

Implement the next bounded Phase 10 slice from this doc:

1. port default `setta` local IDE start onto the Go-owned backend runtime
2. keep transport thin by routing long-lived server startup through the sibling
   `setta-server` executable instead of re-owning server internals in
   `cmd/setta`
3. after default `setta` lands, move `share` and `app` as the remaining
   local-runtime cluster
