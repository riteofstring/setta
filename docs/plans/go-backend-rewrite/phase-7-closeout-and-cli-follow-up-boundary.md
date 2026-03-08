# Phase 7 Closeout And CLI Follow-Up Boundary

## Purpose

This doc closes the backend-runtime portion of Phase 7 after the completed
deployment, launcher, bootstrap, and SSH launch slices.

The goal is to record the current boundary explicitly: the remaining Python
surface inside this cluster is not a hidden launcher/runtime gap. Later review
showed that AI/chat runtime ownership still remained elsewhere and is now
tracked separately in Phase 12.

## Current Status

As of 2026-03-08:

- Go owns the completed non-MCP backend runtime surface tracked through Phase 7:
  - deployment publish/list/latest transport and runtime ownership
  - launcher home, workspace-open, management, and managed-artifact ownership
  - bootstrap HTML and bootstrap token consumption
  - workspace launch-intent storage and local `/launch`
  - SSH/remote `/launch`, trust persistence, and rollback ownership
  - the supporting runtime packages in `internal/deployments`,
    `internal/launcher`, `internal/workspacelaunch`, `internal/sshx`,
    `internal/frontendorigins`, and `internal/httpapi`
- Python still owns adjacent but separate product surface in:
  - `backend/setta/start.py`
  - the CLI-focused tests under `tests/start/`
  - installer/release scripts under `scripts/`
- there is no confirmed Python-owned launcher/deployment runtime gap left
  inside Phase 7's scope
- a later repo-wide review found that AI/chat runtime ownership still remains
  Python-owned, with the current rewrite target narrowed to the external-agent
  path documented in `phase-12-managed-chat-runtime-and-ai-route-foundation.md`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `tests/start/test_ssh_connect.py`
- `cmd/setta-server/main.go`
- `internal/httpapi/workspace_launch_routes.go`
- `internal/workspacelaunch/remote_launch.go`
- `internal/sshx/runtime.go`

## Observations

1. The backend launch/runtime surface is already owned in Go
   - `internal/httpapi/workspace_launch_routes.go` serves
     `POST /createWorkspaceLaunchIntent` and `POST /launch`
   - `internal/workspacelaunch` owns local and remote launch orchestration
   - `internal/sshx` owns SSH parsing, remote session discovery/start, tunnel
     lifecycle, and rollback behavior
   - `internal/httpapi/httpapi.go` and
     `internal/httpapi/bootstrap_page.go` own bootstrap consumption and
     launcher-origin handoff behavior

2. The remaining Python ownership inside this closeout is CLI and distribution
   oriented
   - `backend/setta/start.py` still owns the Click-based commands for
     `launcher` plus other legacy CLI/distribution surfaces
   - remote helper behavior (`status`, `auth`, `tools`, `api`, `stop`,
     `connect`) has since moved into Go `cmd/setta-cli`
   - `cmd/setta-server/main.go` is a server entrypoint, not a replacement for a
     future `cmd/setta-cli`
   - this does not erase the separate AI/chat runtime still owned by Python;
     it only means Phase 7 is not where that work belongs

3. The master rewrite plan already allows this split
   - `go-backend-rewrite-plan.md` treats `cmd/setta-cli` as optional
   - Phase 7 is satisfied when launcher/runtime-control concerns that belong in
     the backend are implemented cleanly or explicitly split
   - keeping Phase 7 open for CLI parity would broaden scope past the backend
     rewrite boundary

## Working Decisions

- close Phase 7 for the backend rewrite
- do not treat Python CLI parity as a hidden backend blocker
- do not treat the remaining AI/chat runtime as a hidden launcher or CLI issue
- if a Go CLI still matters, scope it separately around `cmd/setta-cli`,
  launcher packaging, and distribution scripts
- keep the clean-break rule: a future Go CLI should reuse product semantics,
  not preserve Click command shapes by default

## Recommended Next Step

Do not open another Phase 7 backend slice.

The backend-to-product handoff is now explicit:

1. `phase-8-cli-closeout-and-launcher-distribution-boundary.md` records that
   the remaining Python-owned work is shipped entrypoint, launcher, and
   distribution ownership rather than backend runtime.
2. `phase-9-shipped-entrypoint-and-launcher-distribution-plan.md` is the
   active implementation plan if rewrite work continues beyond the completed
   helper-command migration.
3. `phase-12-managed-chat-runtime-and-ai-route-foundation.md` now tracks the
   separate still-Python-owned external-agent AI backend runtime.

Otherwise move the rewrite effort to stabilization, verification, and release
readiness only for the completed Phase 7 launcher/deployment runtime owners.

## Progress Notes

- 2026-03-08: re-read the current repo state after the completed remote-launch
  landing and confirmed that no Python-owned non-MCP backend runtime surface
  remains.
- 2026-03-08: split the remaining Python CLI/distribution work out of Phase 7
  so the backend rewrite no longer implies a hidden launcher or SSH runtime
  gap.
- 2026-03-08: after the completed Phase 8 CLI slices, the remote helper
  commands (`status`, `auth`, `tools`, `api`, `stop`, `connect`) are no longer
  part of the remaining Python CLI gap.
- 2026-03-08: the remaining post-Phase-8 rewrite work is now planned
  separately in `phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
  so this closeout doc does not carry active implementation scope.
- 2026-03-08: later repo-wide review after the packaged CLI migration found
  that the remaining backend runtime gap was AI/chat ownership in
  the Python AI runtime, not a Phase 7 launcher issue. The current follow-on
  now lives in
  `phase-12-managed-chat-runtime-and-ai-route-foundation.md`.

## Verification

- docs-only update; no runtime tests were needed for this closeout note
