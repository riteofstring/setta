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
- Python still owns:
  - IDE launcher installation/status/update/remove routes in `status.py`
  - launcher-mode recent-workspace and filesystem browser routes in
    `launcher_home.py`
  - launch-intent creation, workspace launch, and bootstrap token/origin
    handoff in `launch.py` and `bootstrap.py`

Nothing in this cluster is currently owned by a Go HTTP route package.

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

Stage 1 may also own artifact install/remove/repair if that is required to keep
the management routes coherent. If artifact ownership turns out to force larger
OS-integration design choices, split the work into:

- Stage 1a: status/read-only plus metadata-only setup/remove/repair behavior
- Stage 1b: managed artifact installation/removal for current platforms

The preferred path is to keep the full management route cluster together if the
artifact boundary stays local to the launcher package.

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

## Recommended Next Step

Implement Stage 1: Go-owned IDE launcher management/status routes and runtime.

Recommended first landing order:

1. metadata and status collection
2. setup/remove/repair ownership
3. update ownership
4. route wiring and app-level integration tests

## Progress Notes

- 2026-03-08: created the dedicated Phase 7 launcher/bootstrap plan and
  selected IDE launcher management/status as the first bounded owner.
