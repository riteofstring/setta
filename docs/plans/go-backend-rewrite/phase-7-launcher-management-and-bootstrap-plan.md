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
- Python still owns:
  - IDE launcher installation/status/update/remove routes in `status.py`
  - launcher-mode workspace-open handoff in `launcher_home.py`
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

## Architecture Check

After reading the current Go entrypoint and launcher-mode surface, the full
management-route slice is not yet independently landable.

Current dependency gap:

- the current Go binary entrypoint in `cmd/setta-server/main.go` does not expose
  a launcher-specific command contract like the Python-managed launcher
  artifacts expect
- Go does not yet own the launcher-mode home/runtime browser routes from
  `launcher_home.py`
- Go does not yet own the launch/bootstrap handoff routes that a launched
  workspace depends on

That means a direct Go port of launcher artifact setup/update today would
either:

- generate desktop artifacts that launch an incomplete Go launcher runtime, or
- keep pointing launcher artifacts back at Python, which violates the clean
  break for this rewrite

Because of that, Stage 1 should not start with managed artifact installation.
The artifact-owning portion of launcher management depends on a real Go launcher
runtime target first.

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

Implement the launcher runtime prerequisite first:

1. establish the Go launcher executable/command contract that installed desktop
   artifacts should target
2. port the launcher-mode home/runtime browser routes needed immediately after a
   launcher starts
3. return to the IDE launcher management/status route cluster once artifact
   setup can target a working Go launcher

This is the recommended option because it preserves a robust source of truth and
avoids shipping launcher setup that writes broken desktop artifacts.

## Recommended Next Step

Create and execute the next focused slice for `POST /openLauncherWorkspace`
plus the launcher executable/target contract it depends on.

Recommended landing order:

1. launcher-mode home/runtime browser ownership
2. launcher executable/target contract for desktop artifacts
3. IDE launcher management/status transport and runtime
4. launch/bootstrap handoff ownership

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
