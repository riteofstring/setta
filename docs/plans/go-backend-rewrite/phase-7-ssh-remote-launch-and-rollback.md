# Phase 7 SSH Remote Launch And Rollback

## Purpose

This doc scopes the remaining Python-owned launch behavior after the completed
local launcher handoff slice.

The goal is to move the SSH/remote `/launch` branch to Go without dragging in
unrelated CLI parity work or re-entangling the local launch/runtime owners that
already landed cleanly.

## Current Status

As of 2026-03-08:

- Go owns:
  - launcher-mode home/runtime browser routes
  - `POST /openLauncherWorkspace`
  - `POST /createWorkspaceLaunchIntent`
  - local `POST /launch`
  - bootstrap HTML and bootstrap token consumption
  - trusted frontend-origin storage/proof validation
  - launched-workspace trust persistence and local rollback for newly started
    local sessions
  - deterministic SSH parsing and remote payload utility ownership in
    `internal/sshx/foundation.go`
  - remote SSH command/session/tunnel runtime ownership in
    `internal/sshx/runtime.go` and `internal/sshx/tunnel.go`
  - the SSH/remote branch of `POST /launch` in
    `internal/workspacelaunch/remote_launch.go`
  - launcher trust-persistence rollback orchestration around the SSH/remote
    `/launch` branch
- Python still owns:
  - no backend behavior inside this scoped SSH launch slice

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-launch-intent-local-launch-and-bootstrap-handoff.md`
- `docs/plans/go-backend-rewrite/phase-7-launcher-management-and-bootstrap-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/reference/auth-and-sessions.md`
- `docs/reference/urls-and-routes.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/routers/launch.py`
- `backend/setta/ssh_common.py`
- `backend/setta/ssh_connect.py`
- `tests/routers/test_launch_routes.py`
- `tests/start/test_ssh_connect.py`
- `frontend/src/components/Pages/Launch/WorkspaceLaunchPage.tsx`
- `frontend/src/components/Modals/WorkspaceSwitcherModal/WorkspaceSwitcherModal.tsx`

## Scope

This slice should move the remaining SSH/remote launch behavior only:

- add a Go-owned SSH/remote runtime package for:
  - SSH argument normalization and control-socket defaults
  - remote JSON payload parsing and validation
  - remote session list parsing
  - remote connect-info validation
  - remote log-path/tunnel-key utility logic
  - remote session discovery/start/connect-info execution
  - local SSH tunnel lifecycle ownership and rollback
- extend the Go workspace-launch owner so `/launch` can:
  - consume a stored launch intent with `sshTarget`
  - open or reuse a remote IDE session
  - validate remote launcher-origin proof handoff
  - persist launched-workspace trust for the launcher session
  - roll back newly started remote sessions and tunnel side effects if trust
    persistence fails
- keep `internal/httpapi` transport thin and preserve the current frontend JSON
  contract for the launch response

## Explicit Non-Goals

Do not include:

- local launch behavior already owned by Go
- launcher management/status routes
- launcher-mode home/directory-browser routes
- CLI `setta connect` parity
- CLI `setta stop` remote parity
- generic SSH helpers unrelated to remote launch/runtime ownership

## Boundary Choice

The remaining remote launch surface splits into three coherent owners:

1. SSH transport and deterministic parsing foundation
   - SSH arg normalization and control-socket defaults
   - remote JSON payload/session/connect-info parsing
   - remote log-path and tunnel-key utilities

2. Remote connect/tunnel runtime
   - remote shell/workspace/setta-command resolution
   - remote session discovery/start/wait/connect-info fetch
   - local SSH tunnel reuse metadata and tunnel startup

3. Launch-route integration and rollback
   - `/launch` remote branch in `internal/workspacelaunch`
   - launcher-origin proof append/validation handoff
   - trust-persistence rollback of remote session plus tunnel side effects

Stage 1 should be the deterministic SSH parsing/utility foundation. It is the
least-coupled landing and gives the remote runtime a typed source of truth
before the first shell-execution owner is wired.

## Working Decisions

- keep SSH and tunnel OS integration in a dedicated `internal/sshx` package
  instead of embedding it in route or launch-service code
- preserve the current `/launch` transport contract for the frontend while
  allowing the Go runtime internals to differ from the Python shape
- keep remote connect-info validation source-of-truth driven:
  typed JSON payload validation plus explicit launcher-origin proof checks
- keep tunnel reuse keyed by deterministic remote endpoint identity rather than
  heuristics
- treat CLI docs/tests as product references for remote behavior, not a
  requirement to port CLI entrypoints in this slice
- keep shell-compatible SSH arg parsing in the bounded `internal/sshx` owner
  instead of broadening this slice into a general shell parser
- reject invalid `settaFilesLocation` values at the utility boundary instead of
  silently downgrading them during remote log-path resolution

## Recommended Landing Order

1. `internal/sshx` parsing and utility foundation
2. `internal/sshx` remote connect and tunnel runtime
3. `internal/workspacelaunch` remote launch orchestration plus rollback
4. `/launch` route integration and focused app/http tests
5. later CLI follow-up if still needed

## Progress Notes

- 2026-03-08: created this focused Phase 7 doc after completing the local
  launch/bootstrap handoff slice and confirming that the only meaningful
  Python-owned launch gap is now the SSH/remote branch plus rollback behavior.
- 2026-03-08: completed Stage 1 from this doc by adding
  `internal/sshx/foundation.go` plus focused unit coverage in
  `internal/sshx/foundation_test.go`. Go now owns deterministic SSH argument
  parsing, control-socket defaulting, remote JSON/session/connect-info parsing,
  remote log-path resolution, and tunnel key/arg utility logic.
- 2026-03-08: completed Stage 2 from this doc by adding the Go-owned remote
  runtime/tunnel owner in `internal/sshx/runtime.go` and
  `internal/sshx/tunnel.go`, with stub-backed integration coverage in
  `internal/sshx/runtime_test.go` and compatibility checks against
  `tests/start/test_ssh_connect.py` plus the focused SSH launch route tests.
- 2026-03-08: completed Stage 3 from this doc by adding the Go-owned remote
  `/launch` integration and rollback owner in
  `internal/workspacelaunch/remote_launch.go`, wiring the thin route/app layer
  updates in `internal/httpapi/workspace_launch_routes.go` and
  `internal/app/app.go`, and adding focused Go plus Python-reference tests.

## Open Questions

None inside this slice. If remote CLI follow-up still matters after this
backend route/runtime landing, it should be scoped as a separate doc instead of
reopening this completed owner.

## Recommended Next Step

Return to `phase-7-runtime-surface-inventory.md` and confirm whether any
non-MCP backend runtime surface remains after the completed launcher/bootstrap
cluster. If remote CLI parity is still in scope, plan it explicitly as a
follow-up instead of extending this completed SSH launch slice.
