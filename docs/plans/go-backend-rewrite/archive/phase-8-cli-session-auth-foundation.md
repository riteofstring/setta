# Phase 8 CLI Session And Auth Foundation

## Purpose

This doc scopes the first bounded Go CLI slice after the backend-runtime
rewrite closed in Phase 7.

The goal is not to port the full Python Click surface at once. The goal is to
land a usable `cmd/setta-cli` foundation that reuses the completed Go
session/auth runtime owners and covers the smallest high-leverage local helper
commands first.

## Current Status

As of 2026-03-08:

- Go already owns the backend runtime needed by local session helper commands:
  - local session registration and persisted metadata in
    `cmd/setta-server/local_session.go` and `internal/localsessions/registry.go`
  - bootstrap token and auth-cookie semantics in `internal/auth`
  - bootstrap URL creation in `internal/launcher/open_workspace.go`
  - launcher-origin proof helpers in `internal/frontendorigins/service.go`
- Go now also owns the first bounded CLI slice in:
  - `cmd/setta-cli/main.go`
  - `internal/settacli/cli.go`
  - `internal/settacli/cli_test.go`
  - `internal/auth/service.go`
  - this slice covers:
    - local `status --connect-info`
    - local `status --list-sessions`
    - local `auth`
- Python still owns the user-facing CLI in `backend/setta/start.py`
- the next bounded CLI gap after this foundation was the tool-facing cluster,
  which is now tracked and implemented in
  `phase-8-cli-tools-and-api-foundation.md`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `tests/start/test_start_status.py`
- `tests/start/test_start_auth_api.py`
- `tests/start/test_start_cli_helpers.py`
- `cmd/setta-server/local_session.go`
- `internal/localsessions/registry.go`
- `internal/auth/service.go`
- `internal/auth/token.go`
- `internal/frontendorigins/service.go`
- `internal/launcher/open_workspace.go`
- `internal/config/config.go`

## Boundary Choice

The remaining Python CLI surface splits cleanly into these clusters:

1. Local read-only session/auth helpers
   - session discovery and selection
   - bootstrap/auth output rendering
   - local workspace/runtime-path resolution

2. Local mutation helpers
   - `stop`
   - launcher management subcommands
   - backups and other filesystem mutations

3. Remote SSH helpers
   - `connect`
   - remote `stop`

4. Tool-facing CLI
   - `tools`
   - `api`

Stage 1 should be cluster 1. It reuses completed Go runtime owners, avoids new
network/SSH/process orchestration, and forms the auth/session foundation that
later `api` and `connect` slices can build on.

## Scope

Stage 1 should add a Go-owned `cmd/setta-cli` with:

- global runtime-path flags:
  - `--workspace`
  - `--profile`
  - `--setta-home`
  - `--profile-lookup-home`
  - `--setta-files-root`
  - `--setta-files-location`
  - `--runtime-root`
- `status` subcommand support for:
  - `--connect-info`
  - `--list-sessions`
  - `--json`
  - `--workspace`
  - `--session`
  - `--latest`
  - `--server-mode`
  - `--launcher-origin`
- `auth` subcommand support for:
  - `--json`
  - `--workspace`
  - `--session`
  - `--latest`
  - `--base-url`
- focused Go tests for session selection, path resolution, bootstrap/auth
  payloads, and IDE-vs-launcher default filtering

## Explicit Non-Goals

Do not include in this slice:

- `setta` server start/share/app entrypoints
- `stop`
- `connect`
- `tools`
- `api`
- launcher install/update/remove subcommands
- plugin CLI parity
- interactive prompts beyond the minimum needed to reject ambiguous selection

## Working Decisions

- keep the Go CLI as a separate executable, `cmd/setta-cli`, instead of
  folding subcommands into `cmd/setta-server`
- preserve the existing JSON payload shapes for `status --json` and
  `auth --json` where they already match useful product semantics, because
  reusing them is simpler than inventing a new contract
- default `status --connect-info` and `auth` to IDE-mode sessions, matching the
  existing product behavior
- keep selection deterministic and non-interactive for this first slice:
  require `--session` or `--latest` when multiple sessions match
- resolve runtime roots through `internal/config` rather than ad hoc path
  concatenation
- keep command parsing explicit and local; avoid introducing a heavy CLI
  framework unless a later slice proves it necessary

## Recommended Landing Order

1. `cmd/setta-cli` entrypoint and shared argument parsing
2. local session lookup/selection helpers above `internal/localsessions`
3. `status --connect-info` and `status --list-sessions`
4. `auth`
5. focused Go tests
6. later follow-up slices for `api`, `connect`, and mutation commands

## Progress Notes

- 2026-03-08: created this doc after closing Phase 7 and confirming that the
  remaining Python surface is CLI/distribution scope rather than backend
  runtime scope.
- 2026-03-08: completed Stage 1 from this doc by adding the new
  `cmd/setta-cli` entrypoint, the first Go CLI runner in
  `internal/settacli/cli.go`, shared session/auth helpers over
  `internal/localsessions` and `internal/auth`, and focused Go coverage in
  `internal/settacli/cli_test.go`. This landing preserves the documented JSON
  payloads for local `status --connect-info`, local `status --list-sessions`,
  and local `auth`, including IDE-default session filtering and stale-session
  rejection for unrelated processes.
- 2026-03-08: the next tool-facing follow-up from this doc is now complete in
  `phase-8-cli-tools-and-api-foundation.md`, so this foundation doc is no
  longer the active Phase 8 slice.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/settacli ./cmd/setta-cli -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/auth ./internal/localsessions -count=1 -timeout 300s`

## Recommended Next Step

Use `phase-8-cli-tools-and-api-foundation.md` as the current Phase 8 follow-up
record. After that landed slice, the next bounded CLI decision is whether to
take SSH/remote helpers (`connect` / remote `stop`) or local mutation helpers
(`stop`, launcher management, backups) next.
