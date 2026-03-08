# Phase 8 CLI Connect Runtime And Output Modes

## Purpose

This doc scopes the next bounded Go CLI slice after the completed remote
`stop` landing.

The remaining Python-owned gap is the user-facing `setta connect` command
above the already-completed Go SSH runtime in `internal/sshx`.

## Current Status

As of 2026-03-08:

- Go already owns:
  - local CLI `status`, `auth`, `tools`, and `api`
  - remote CLI `stop`
  - backend SSH session discovery, remote start, remote connect-info, and
    local background tunnel reuse in `internal/sshx`
- Python still owns:
  - `setta connect`
  - the CLI-only output-mode behavior layered above the SSH runtime

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/plans/go-backend-rewrite/phase-7-ssh-remote-connect-and-tunnel-runtime-stage2.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-remote-stop-and-connect-foundation.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/ssh_connect.py`
- `tests/start/test_ssh_connect.py`
- `tests/start/test_start_remote_path_forwarding.py`
- `internal/sshx/foundation.go`
- `internal/sshx/runtime.go`
- `internal/sshx/tunnel.go`

## Scope

This slice should add Go `setta connect` support for the remote SSH branch:

- `connect` plus alias `c`
- positional `ssh_target`
- `--workspace`
- `--session`
- `--latest`
- `--ssh-args`
- `--remote-cmd`
- `--local-port`
- `--detach`
- `--print-only`
- `--no-open`
- `--verbose`

It should cover these behaviors:

- deterministic non-interactive session selection:
  - exact `--session`
  - newest `--latest`
  - reuse the single matching IDE session when exactly one exists
  - if multiple matching sessions exist without a selector, fail with a clear
    error instead of interactive prompts
- remote path/identity forwarding without local profile validation:
  - `--profile`
  - `--setta-home`
  - `--setta-files-root`
  - `--setta-files-location`
  - `--runtime-root`
- remote start when no IDE session exists
- three CLI output modes above the same connect plan:
  - `--print-only`: print tunnel command, local bootstrap URL, and token
    without creating a tunnel
  - `--detach`: ensure a background tunnel exists and optionally open the URL
  - default mode: run the SSH tunnel in the foreground and optionally open the
    URL

## Explicit Non-Goals

Do not include in this slice:

- interactive multi-session prompts or delete-in-prompt flows
- local `connect`
- launcher-origin handoff wiring
- local session registry writes for remote sessions
- broad refactors of the completed SSH runtime

## Working Decisions

- keep the connect selector non-interactive; the clean-break Go CLI does not
  need to preserve the Python prompt loop
- keep `internal/sshx` as the source of truth for remote shell/workspace
  resolution, remote session start/wait, and background tunnel metadata reuse
- add a focused `internal/sshx` planning helper if needed so the CLI can reuse
  the same remote-session/connect-info path across `--print-only`, `--detach`,
  and foreground tunnel modes without creating transport-specific duplication
- keep browser opening as a thin CLI/OS-integration layer
- support alias `c` in this slice because it is already documented and trivial
  once `connect` exists

## Recommended Landing Order

1. add this doc and refresh the README ordering
2. expose any missing `internal/sshx` connect-planning helper needed above the
   existing runtime
3. add Go CLI `connect` / `c` support with deterministic selection and the
   three output modes
4. add focused SSH-stub-backed Go coverage for forwarding, selection, startup,
   and mode-specific behavior
5. update this doc with completion notes, verification, and the next remaining
   CLI gap if any

## Progress Notes

- 2026-03-08: created this doc after completing remote `stop` and confirming
  that `connect` is the remaining Phase 8 SSH-helper gap. The main boundary is
  no longer backend SSH behavior; it is CLI orchestration across print-only,
  detach, and foreground tunnel modes.

## Verification

- pending implementation

## Recommended Next Step

Implement this doc end-to-end: add the minimal `internal/sshx` connect-planning
surface needed by the CLI, then land Go `connect` / `c` with deterministic
session selection and mode-specific tunnel behavior.
