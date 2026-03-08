# Phase 8 CLI Remote Stop And Connect Foundation

## Purpose

This doc scopes the next bounded Go CLI slice after the completed local
session/auth and tool-facing foundations.

The goal is to move the SSH helper surface into Go without reopening the
completed backend SSH runtime work from Phase 7. The active boundary is the CLI
owner above `internal/sshx`.

## Current Status

As of 2026-03-08:

- Go already owns the backend SSH runtime and tunnel lifecycle in:
  - `internal/sshx/foundation.go`
  - `internal/sshx/runtime.go`
  - `internal/sshx/tunnel.go`
- Go already owns the local CLI foundations in:
  - `cmd/setta-cli/main.go`
  - `internal/settacli/cli.go`
  - `internal/settacli/tool_api.go`
- Go now owns the remote SSH `stop` path in:
  - `internal/settacli/remote_stop.go`
  - exported list/delete helpers in `internal/sshx/runtime.go`
- Python still owns the user-facing SSH helper CLI orchestration in:
  - `backend/setta/start.py`
  - `backend/setta/ssh_connect.py`
- the next bounded CLI gap is the remote helper cluster:
  - none inside the SSH helper cluster; `connect` has moved to its own completed
    Stage 2 doc

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/plans/go-backend-rewrite/phase-7-ssh-remote-launch-and-rollback.md`
- `docs/plans/go-backend-rewrite/phase-7-ssh-remote-connect-and-tunnel-runtime-stage2.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-session-auth-foundation.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-tools-and-api-foundation.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/ssh_connect.py`
- `backend/setta/ssh_common.py`
- `tests/start/test_ssh_connect.py`
- `tests/start/test_start_remote_path_forwarding.py`
- `internal/sshx/foundation.go`
- `internal/sshx/runtime.go`
- `internal/sshx/tunnel.go`
- `internal/sshx/runtime_test.go`

## Boundary Choice

This cluster is still too large for one undifferentiated landing.

Stage 1 should be:

1. remote session discovery and selection foundations above `internal/sshx`
2. remote `stop`

Stage 2 should be:

1. `connect`
2. tunnel presentation / print-only / foreground-vs-background CLI behavior

This split keeps the first landing on deterministic remote session selection
and path forwarding, while leaving the larger tunnel/browser UX surface for its
own follow-up stage.

## Stage 1 Scope

Stage 1 should add:

- exported `internal/sshx` helpers for:
  - listing remote sessions for a workspace and server mode
  - deleting a specific remote session without using rollback-only naming
- Go CLI `stop` support for the remote SSH branch only:
  - positional `ssh_target`
  - `--workspace`
  - `--session`
  - `--latest`
  - `--all`
  - `--server-mode`
  - `--ssh-args`
  - `--remote-cmd`
- deterministic target selection:
  - if multiple sessions match, require `--session`, `--latest`, or `--all`
- remote path/identity forwarding without local profile validation:
  - `--profile`
  - `--setta-home`
  - `--setta-files-root`
  - `--setta-files-location`
  - `--runtime-root`
- focused Go tests for:
  - path forwarding with unknown local profiles
  - server-mode forwarding
  - multi-session selection errors
  - remote session deletion using the real SSH stub

## Stage 1 Explicit Non-Goals

Do not include in this stage:

- local `stop`
- `connect`
- interactive remote session prompts
- browser opening
- tunnel foreground ownership in the CLI
- alias commands such as `setta c`

## Working Decisions

- keep remote path/identity flags as remote-only inputs for this slice; do not
  route them through local profile/config resolution
- keep selection deterministic and non-interactive, matching the first local
  CLI slices
- use exported `internal/sshx` service methods as the source of truth for
  remote session list/delete behavior instead of rebuilding SSH command strings
  in `internal/settacli`
- add clearer exported remote-delete naming in `internal/sshx` even if the
  implementation reuses the completed rollback-time delete path internally
- leave `connect` for Stage 2 because print-only, tunnel mode, and browser
  behavior are a separate CLI concern above the same remote-session foundation

## Recommended Landing Order

1. add this doc and refresh the README ordering
2. expose Stage 1 `internal/sshx` session list/delete helpers
3. add remote `stop` support in `internal/settacli`
4. add focused Go coverage against the SSH stub and CLI path-forwarding rules
5. update this doc with Stage 1 completion notes and the recommended Stage 2
   follow-up

## Progress Notes

- 2026-03-08: created this doc after confirming that the next CLI gap is the
  SSH helper cluster above the already-completed `internal/sshx` runtime, and
  that remote `stop` is the best first Stage 1 landing before `connect`.
- 2026-03-08: completed Stage 1. Go now exposes explicit remote session
  list/delete helpers in `internal/sshx`, and `cmd/setta-cli` now supports the
  remote `stop` branch with deterministic `--session` / `--latest` / `--all`
  selection, remote-only path/profile forwarding, and default IDE vs optional
  launcher server-mode filtering.
- 2026-03-08: updated the SSH test stub to enumerate multiple remote sessions,
  apply `--server-mode` filtering, and log normalized remote commands so the
  Go tests assert real forwarding behavior instead of brittle shell-quoted
  strings.
- 2026-03-08: completed Stage 2 in the follow-up doc
  `phase-8-cli-connect-runtime-and-output-modes.md`; Go now owns `connect` and
  `c` above the same `internal/sshx` runtime foundation.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/sshx -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/settacli ./cmd/setta-cli -count=1 -timeout 300s`

## Recommended Next Step

The SSH helper cluster tracked by this doc is complete. The closeout/inventory
follow-up now lives in
`phase-8-cli-closeout-and-launcher-distribution-boundary.md`.
