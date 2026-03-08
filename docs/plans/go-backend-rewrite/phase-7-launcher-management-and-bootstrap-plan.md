# Phase 7 Launcher Management And Bootstrap Plan

## Purpose

This doc scopes the remaining Python-owned launcher and bootstrap backend
surface after the completed deployment publication/listing slice.

The immediate goal is not to port the whole launcher stack at once. The goal is
to pick the first bounded owner inside that cluster, land it end to end, and
leave launch/bootstrap handoff behavior for a later slice with explicit
boundaries.

## Current Status

As of 2026-03-08:

- Go owns the completed Phase 6 MCP parity surface
- Go owns deployment runtime/session reads plus IDE-mode share/app deployment
  publish/list/latest transport
- Go owns the first launcher-mode home slice for recent workspaces and
  directory browsing
- Go now owns the focused launcher workspace-open/runtime slice:
  - `POST /openLauncherWorkspace`
  - local IDE session spawn/reuse for launcher-mode opens
  - bootstrap URL fragment minting for launched IDE sessions
  - launcher last-used-workspace and recent-workspace updates
- Go now owns the Stage 1a launcher management/status slice:
  - launcher metadata parsing, validation, and persistence
  - metadata-only setup/repair/remove/update runtime ownership
  - IDE routes for `launcherStatus`, `setupLauncher`, `repairLauncher`,
    `removeLauncher`, and `updateLauncher`
- Go now owns the Stage 1b launcher artifact slice:
  - managed artifact planning/install/remove/update ownership
  - launcher ownership-marker writes/removals and cleanup rules
  - a dedicated desktop-launch contract via `--launcher-artifact-run`
- Go owns the launcher executable/bootstrap prerequisite:
  - local IDE/launcher session registration and cleanup
  - bootstrap HTML at `GET /__setta__/bootstrap`
  - launcher-mode fallback startup without an explicit project workspace
- Go now owns the local launch/bootstrap handoff slice:
  - `POST /createWorkspaceLaunchIntent`
  - local `POST /launch`
  - launcher-origin proof append and launched-workspace trust persistence
  - rollback for newly started local sessions when trust persistence fails
- Go now owns the Stage 1 SSH/remote launch foundation:
  - deterministic SSH arg parsing and control-socket defaulting
  - remote JSON/session/connect-info parsing
  - remote log-path and tunnel utility logic in `internal/sshx/foundation.go`
- Python still owns:
  - SSH/remote launch plus remote rollback behavior in `launch.py`
- the remaining Phase 7 launcher gap is now concentrated around
  SSH/remote launch follow-up work

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/reference/auth-and-sessions.md`
- `docs/reference/setta-cli-commands.md`
- `docs/reference/setta-files.md`
- `backend/setta/routers/status.py`
- `backend/setta/routers/launcher_home.py`
- `backend/setta/routers/launch.py`
- `backend/setta/routers/bootstrap.py`
- `backend/setta/launcher_setup.py`
- `backend/setta/launcher_metadata.py`
- `backend/setta/routers/launcher_scope.py`
- `tests/routers/test_launcher_management_routes.py`
- `tests/routers/test_launcher_home_routes.py`
- `tests/routers/test_launch_routes.py`
- `tests/auth/test_auth_bootstrap_integration.py`
- `tests/auth/test_cors.py`

## Boundary Choice

The launcher/bootstrap cluster splits into three coherent owners:

1. IDE launcher management
   - `GET /launcherStatus`
   - `POST /setupLauncher`
   - `POST /repairLauncher`
   - `POST /removeLauncher`
   - `POST /updateLauncher`
   - persistence: launcher metadata JSON and optional managed desktop/browser
     artifacts under `setta_home/launcher`

2. Launcher-mode home/runtime browser
   - recent workspaces
   - filesystem roots and directory listing
   - open-workspace handoff from launcher mode

3. Launch/bootstrap/handoff
   - launch intent creation
   - `/launch`
   - bootstrap page and token consumption
   - launcher-origin trust and remote-handoff proof handling

Stage 1 should be IDE launcher management. It is the least-coupled slice:

- IDE-mode only
- mostly local filesystem and process execution
- no launcher-mode session bootstrap dependency
- no trusted-origin handoff dependency
- existing Python behavior is already covered by focused route tests

## Stage 1 Scope

Stage 1 moves launcher management/status transport and runtime ownership to Go:

- implement a Go launcher owner for metadata read/write, target validation, and
  update-capability/status reporting
- serve the IDE routes listed above from Go
- preserve the current frontend JSON contract for this route cluster so the
  frontend does not need to move in the same slice
- keep transport thin and put launcher semantics in a dedicated package

Stage 1 is now intentionally split:

- Stage 1a: status/read-only plus metadata-only setup/remove/repair/update
  behavior
- Stage 1b: managed artifact installation/removal/update ownership for current
  platforms

That split is now the preferred path because the metadata/status owner is
landed and the remaining artifact work has its own clear OS-integration
boundary.

## Architecture Check

The earlier management-route blocker from this plan is now cleared enough to
move back to launcher management/status ownership.

The previously missing prerequisite is now in place:

- the current Go binary now has a usable launcher runtime contract
- Go now owns the launcher-mode home/runtime browser routes needed to get from
  launcher mode into a local IDE session
- Go now serves the bootstrap HTML consumed by those Go-owned launch flows

The remaining boundary question is narrower now: whether the next management
slice should start with metadata/status/setup/remove semantics only or include
artifact install/update ownership in the same landing.

## Explicit Non-Goals

Do not broaden Stage 1 into:

- launcher-mode home routes
- recent workspace persistence
- filesystem browsing APIs
- workspace launch intent creation
- `/launch`
- bootstrap HTML or bootstrap token consumption
- launcher-origin trust persistence or CORS/trusted-origin changes

## Proposed Go Ownership

- `internal/launcher`
  - metadata schema and read/write
  - setta-home scoped status collection
  - setup/repair/remove/update operations
  - target validation and update-capability reporting
  - artifact install/remove ownership if kept in Stage 1

- `internal/httpapi`
  - thin launcher management routes
  - IDE-mode middleware only
  - request/response contract matching current frontend expectations

- `internal/app`
  - route wiring and dependency construction

## Early Design Decisions

- keep launcher metadata as the source of truth instead of inferring install
  status from artifact presence
- resolve `settaHome` exactly as Python does: explicit non-blank request value
  wins, otherwise use backend default setta home
- preserve the current route payload shape for the management slice to avoid
  coupling this backend rewrite step to frontend generation work
- keep update execution explicit and local; do not fold launcher update logic
  into generic package-management helpers
- do not land Go-owned desktop artifact setup until those artifacts can target a
  real Go launcher runtime contract end to end

## Recommended Option

Implement launch/bootstrap handoff ownership next, now that launcher
management including managed artifacts is complete.

This remains the recommended option because:

- launcher management no longer blocks desktop artifact ownership
- the remaining Python surface is now tightly concentrated in launch intent,
  launch handoff, and bootstrap/origin trust
- that boundary is product-significant and no longer mixed with unrelated OS
  integration concerns

## Recommended Next Step

Implement Stage 2 from `phase-7-ssh-remote-launch-and-rollback.md`: the
`internal/sshx` remote connect/tunnel runtime.

Recommended landing order:

1. `internal/sshx` remote connect/tunnel runtime
2. remote `/launch` orchestration plus rollback ownership
3. any follow-up CLI or cleanup work after those owners land

## Progress Notes

- 2026-03-08: created the dedicated Phase 7 launcher/bootstrap plan and
  selected IDE launcher management/status as the first bounded owner.
- 2026-03-08: after reading the current Go entrypoint plus launcher-mode route
  coverage, determined that artifact-owning launcher management is blocked on a
  launcher runtime prerequisite. Recommended next step changed to launcher-mode
  runtime ownership plus a real launcher executable contract.
- 2026-03-08: split the launcher runtime prerequisite into a first bounded
  launcher-home slice in
  `phase-7-launcher-home-recent-workspaces-and-directory-browser.md`.
- 2026-03-08: completed that launcher-home slice in Go; next recommended step
  is the focused `openLauncherWorkspace` plus launcher executable/target
  contract slice.
- 2026-03-08: split that next slice into a dedicated implementation doc in
  `phase-7-launcher-open-workspace-and-bootstrap-contract.md`; the immediate
  landing target is now Stage 1 from that doc: executable/bootstrap contract
  ownership.
- 2026-03-08: completed Stage 1 from
  `phase-7-launcher-open-workspace-and-bootstrap-contract.md`; next
  recommended step is Stage 2 from that doc: Go-owned
  `POST /openLauncherWorkspace`.
- 2026-03-08: completed Stage 2 from
  `phase-7-launcher-open-workspace-and-bootstrap-contract.md`; Go now owns the
  launcher-mode workspace-open path end to end. The next recommended step is a
  focused launcher management/status slice above that runtime prerequisite.
- 2026-03-08: completed Stage 1a from
  `phase-7-launcher-management-metadata-and-status-stage1a.md`; Go now owns
  launcher metadata/status plus metadata-only setup/repair/remove/update. The
  next recommended step is Stage 1b artifact ownership, tracked in
  `phase-7-launcher-management-artifact-ownership-stage1b.md`.
- 2026-03-08: completed Stage 1b from
  `phase-7-launcher-management-artifact-ownership-stage1b.md`; Go now owns
  managed launcher artifact planning/install/remove/update plus the dedicated
  `--launcher-artifact-run` contract. The next recommended step is the
  remaining launch/bootstrap handoff slice.
- 2026-03-08: created
  `phase-7-launch-intent-local-launch-and-bootstrap-handoff.md` to split that
  remaining gap into a first local launch/bootstrap handoff slice and a later
  SSH/remote launch follow-up.
- 2026-03-08: completed Stage 1 from
  `phase-7-launch-intent-local-launch-and-bootstrap-handoff.md`; Go now owns
  `POST /createWorkspaceLaunchIntent`, launch-intent storage, trusted
  frontend-origin storage/proof validation, and bootstrap-page parity for
  workspace-history and launcher-origin handoff. The next recommended step is
  Stage 2 from that doc: Go-owned local `/launch`.
- 2026-03-08: completed Stage 2 from
  `phase-7-launch-intent-local-launch-and-bootstrap-handoff.md`; Go now owns
  the local `/launch` handoff path, launcher-origin proof append, launched
  workspace trust persistence, and rollback for newly started local sessions.
  The next recommended step is a dedicated SSH/remote launch follow-up plan
  doc and slice.
- 2026-03-08: created
  `phase-7-ssh-remote-launch-and-rollback.md` to track the remaining
  SSH/remote `/launch` and rollback work as a separate follow-up slice.
- 2026-03-08: completed Stage 1 from
  `phase-7-ssh-remote-launch-and-rollback.md` by adding the deterministic
  `internal/sshx` foundation and focused tests. The next recommended step is
  Stage 2 from that doc: the remote connect and tunnel runtime.
