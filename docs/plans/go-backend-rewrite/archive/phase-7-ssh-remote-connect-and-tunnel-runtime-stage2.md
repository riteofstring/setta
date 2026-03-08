# Phase 7 SSH Remote Connect And Tunnel Runtime Stage 2

## Purpose

This doc narrows Stage 2 from
`phase-7-ssh-remote-launch-and-rollback.md` into one executable landing:
Go-owned remote SSH command execution, remote session startup/polling, and
reusable local tunnel lifecycle ownership.

The goal is to finish the remote runtime owner before wiring the `/launch`
transport branch. Stage 3 should be route orchestration only.

## Current Status

As of 2026-03-08:

- Go owns the deterministic SSH foundation in `internal/sshx/foundation.go`
- Go now also owns the Stage 2 runtime in:
  - `internal/sshx/runtime.go`
  - `internal/sshx/tunnel.go`
  - `internal/sshx/runtime_test.go`
- Python still owns the `/launch` remote branch that orchestrates those runtime
  calls and the trust-persistence rollback around them

## Scope

Stage 2 should add a dedicated `internal/sshx` runtime owner that:

- runs SSH commands with explicit timeout/error shaping
- resolves:
  - remote shell
  - remote canonical workspace path
  - remote Setta command
- builds remote Setta path arguments without transport coupling
- fetches remote sessions and connect info using the Stage 1 parsing helpers
- starts remote Setta when no matching IDE session exists
- waits for a remote IDE session with a deterministic timeout/log-path message
- persists reusable SSH tunnel metadata under the local runtime root
- reuses an existing matching local tunnel when the PID identity still matches
- starts a new tunnel when metadata is stale or the requested local port changes
- rolls back remote session and local tunnel side effects when explicitly asked

## Explicit Non-Goals

Do not include:

- HTTP route changes
- `/launch` transport wiring
- launcher-origin trust persistence
- launcher bootstrap URL append logic in the route layer
- CLI `setta connect` / `setta stop` parity

## Proposed Ownership

- `internal/sshx`
  - `Service` for remote SSH/runtime operations
  - command execution helpers
  - remote connect result types
  - tunnel metadata persistence and process lifecycle ownership
- `internal/workspacelaunch`
  - later Stage 3 consumer of the Stage 2 service

## Working Decisions

- use real subprocess execution via `os/exec`, not framework wrappers
- keep SSH binary selection explicit through `SSHCommandPrefix`, honoring
  `SETTA_SSH_BIN` when no explicit binary override is provided
- persist tunnel metadata under `<runtimeRoot>/ssh_tunnels/*.json`
- use PID create-time matching before reusing or killing a tunnel process
- keep Stage 2 tests as close to production behavior as possible by using the
  existing `scripts/test/ssh` stub and real temp session metadata, not pure
  in-memory stubs
- keep tunnel readiness checking source-of-truth driven:
  local port accepts a TCP connection, unless the existing ssh stub explicitly
  disables forwarding via `SETTA_SSH_STUB_DISABLE_FORWARD`

## Implementation Plan

1. Add this Stage 2 doc and commit it.
2. Implement `internal/sshx` service/runtime files for:
   - SSH command execution and timeouts
   - remote shell/workspace/setta-command resolution
   - remote Setta command execution, list/wait/connect-info fetch, and start
   - tunnel metadata load/write/reuse/start/rollback
   - high-level `ConnectWorkspaceSession` and `RollbackRemoteWorkspaceLaunch`
3. Add focused tests using:
   - the real `scripts/test/ssh` helper
   - temp local runtime/session roots
   - real metadata files and tunnel processes
4. Update the parent Phase 7 docs to mark Stage 2 complete and point to Stage 3.

## Test Plan

- `./scripts/go.sh test ./internal/sshx -count=1 -timeout 300s`
- if Stage 2 needs new ssh-stub behavior for remote startup/tunnel reuse tests,
  update that helper in the same slice and cover the new behavior from Go tests

## Progress Notes

- 2026-03-08: created this Stage 2 implementation doc to isolate the remote
  runtime owner from the later `/launch` integration slice.
- 2026-03-08: completed Stage 2 by adding the Go-owned `internal/sshx`
  runtime/tunnel service in `runtime.go` and `tunnel.go`, extending the shared
  `scripts/test/ssh` helper for real remote-start and delete-session coverage,
  and landing focused Go tests in `runtime_test.go`.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/sshx -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_ssh_connect.py -q`
- `source activate.sh && python -m pytest tests/routers/test_launch_routes.py -q -k 'launch_over_ssh_returns_bootstrap_url or launch_over_ssh_reuses_existing_tunnel'`

## Recommended Next Step

Implement Stage 3 from `phase-7-ssh-remote-launch-and-rollback.md`: wire the
Go-owned remote `/launch` branch in `internal/workspacelaunch` on top of the
completed `internal/sshx` service, including launcher trust-persistence
rollback.
