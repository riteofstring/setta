# Phase 10 Default Local IDE Start Stage 2

## Purpose

This doc scopes the second bounded Phase 10 slice after the completed Go-owned
`setta launch` migration.

The goal is to move the default local `setta` start path onto the shipped
Go-owned CLI without pulling `share`, `app`, or maintenance commands into the
same change.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
- Go already owns the backend runtime executable and local-session bootstrap in:
  - `cmd/setta-server`
  - `cmd/setta-server/local_session.go`
  - `internal/app`
  - `internal/config`
  - `internal/localsessions`
- Go already owns `setta launch`, which proves the shipped CLI can resolve and
  start the sibling `setta-server` executable for local IDE sessions.
- Go now owns the default no-subcommand `setta` path across:
  - `cmd/setta`
  - `cmd/setta-server`
  - `backend/setta/entrypoint.py`
  - focused tests in `internal/settacmd`, `cmd/setta-server`, and
    `tests/start/test_module_entrypoint.py`

## Inputs

- `docs/plans/go-backend-rewrite/phase-10-local-runtime-command-cluster-plan.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/utils/network.py`
- `tests/start/test_startup_message.py`
- `tests/start/test_start_interrupt_handling.py`
- `tests/start/test_start_workspace_validation.py`
- `cmd/setta-server/main.go`
- `cmd/setta-server/local_session.go`
- `cmd/setta-server/local_session_test.go`
- `internal/settacmd/cli.go`
- `internal/settacmd/launch.go`

## Problem Shape

The remaining gap is not backend runtime ownership. The runtime already exists
in Go.

The gap is the user-facing contract for the default local `setta` path:

1. `cmd/setta` previously treated "no command" as an error.
2. `backend/setta/entrypoint.py` previously left no-subcommand invocation on
   the Python side.
3. `cmd/setta-server` previously could run the IDE server, but did not yet own the
   startup UX that users expect from `setta`:
   - startup message
   - bootstrap URL/token display
   - browser auto-open when appropriate

## Scope

This stage should cover only:

- default no-subcommand `setta` local IDE start
- shipped entrypoint dispatch for that no-subcommand path
- Go-owned startup output and browser-open behavior for local IDE mode

Do not include:

- `share`
- `app`
- `backups`
- `plugins`
- `export-db`
- remote start/connect changes

## Working Decisions

- keep `cmd/setta` thin
  - it should parse the user-facing root flags and delegate long-lived runtime
    execution to the sibling `setta-server` executable
- keep `cmd/setta-server` as the long-lived runtime owner
  - it should own local-session bootstrap, bootstrap token creation, startup
    output, and browser-open behavior for the default local IDE server path
- do not port Python `--reload` semantics in this stage
  - packaged Go `setta` should reject `--reload` explicitly
  - dev reload remains a dev-script concern, not a shipped CLI requirement
- use source-of-truth runtime/session data, not heuristics
  - startup URLs should be built from the actual bound listener/session values
  - browser-open decisions should use explicit OS/session checks

## Implementation Shape

1. extend `internal/settacmd` root parsing
   - support no-subcommand execution as the default local start path
   - accept the root local-start flags needed by shipped `setta`
   - reject `--reload` explicitly for the Go-owned path
2. delegate default local start from `cmd/setta` to the sibling
   `setta-server`
   - resolve the sibling executable deterministically
   - pass explicit IDE-mode runtime flags
   - preserve foreground stdio behavior
3. add Go-owned startup UX to `cmd/setta-server`
   - bootstrap URL/token generation from the created local session
   - startup message rendering
   - browser auto-open policy and failure fallback
4. update the thin Python wrapper
   - no-subcommand and root-flags-only local start should dispatch to the
     packaged Go binary

## Test Strategy

- add focused `internal/settacmd` tests for:
  - no-subcommand routing
  - sibling `setta-server` argument construction
  - explicit `--reload` rejection
  - propagated child exit codes
- add focused `cmd/setta-server` tests for:
  - startup message rendering
  - bootstrap URL host normalization
  - browser-open fallback behavior
- extend `tests/start/test_module_entrypoint.py` so `python -m setta` with no
  subcommand dispatches to Go

## Explicit Non-Goals

- recreating Uvicorn reload support
- changing `share`/`app` ownership
- turning `cmd/setta` into a second backend runtime
- preserving Python Click help text as the command source of truth

## Progress Notes

- 2026-03-08: completed this Stage 2 slice.
  - `cmd/setta` now treats no subcommand as the default local IDE start path
  - the shipped Python wrapper now dispatches no-subcommand local start to Go
  - `cmd/setta-server` now emits startup output, builds bootstrap URLs from the
    created session, and auto-opens the browser when appropriate
  - the shipped Go CLI rejects `--reload` explicitly for this path

## Open Questions

- root `--help` still remains outside this slice's implementation scope
- `share` and `app` remain the next local-runtime migrations

## Verification

- `git diff --check`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/settacmd -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./cmd/setta-server -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`

## Recommended Next Step

Move to the remaining local-runtime commands:

1. `share`
2. `app`
