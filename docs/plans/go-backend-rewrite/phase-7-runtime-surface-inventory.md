# Phase 7 Runtime Surface Inventory

## Purpose

This doc starts the post-MCP handoff after the completed Phase 6 parity work.

The goal is to inventory the remaining Python-owned backend runtime surface
outside MCP so the rewrite can pick the first bounded Phase 7 owner without
guesswork.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity is complete for the Python-owned MCP surface tracked in
  `phase-6-post-project-state-mcp-surface-inventory.md`
- Go already owns:
  - MCP server/client transport and scoped tool execution
  - plugin discovery/mutation/runtime owners used by the completed MCP slice
  - deployment session/state read routes in `internal/httpapi/deployment_routes.go`
  - deployment runtime/session storage in `internal/deployments/runtime.go`
  - deployment catalog/list/latest reads and version allocation in
    `internal/deployments/catalog.go`
  - share deployment publication from the live runtime snapshot in
    `internal/deployments/share_publish.go`
  - app deployment publication from the live runtime snapshot in
    `internal/deployments/app_publish.go`
  - IDE-mode share/app deployment publish/list/latest routes in
    `internal/httpapi/deployment_ide_routes.go`
  - launcher-mode recent-workspace and directory-browser routes in
    `internal/httpapi/launcher_home_routes.go`
- Python still appears to own major non-MCP backend surface in:
  - launcher and launch/session bootstrap flows
  - launcher installation and status management
  - bootstrap and launcher-origin handoff behavior around launched workspaces
- nothing is currently in progress in the worktree

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `backend/setta/routers/launch.py`
- `backend/setta/routers/launcher_home.py`
- `backend/setta/routers/status.py`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/routers/app_deployments.py`
- `backend/setta/routers/bootstrap.py`
- `internal/httpapi/deployment_routes.go`
- `internal/deployments/runtime.go`
- `internal/app/app.go`

## Initial Observations

1. Launcher/runtime-control still looks Python-owned
   - the Python routers for `launch.py`, `launcher_home.py`, and launcher parts
     of `status.py` expose workspace launch, recent-workspace storage, launcher
     installation/update/remove, and launcher-mode filesystem browsing
   - current route overlap includes:
     - `/launch`
     - `/createWorkspaceLaunchIntent`
     - `/launcherStatus`
     - `/setupLauncher`
     - `/repairLauncher`
     - `/removeLauncher`
     - `/updateLauncher`
     - `/launcherRecentWorkspaces`
     - `/addLauncherRecentWorkspace`
     - `/removeLauncherRecentWorkspace`
     - `/pinLauncherRecentWorkspace`
     - `/launcherFilesystemRoots`
     - `/listLauncherDirectory`
     - `/openLauncherWorkspace`
   - there is no obvious Go HTTP route cluster that owns those flows today

2. Deployment runtime handoff is now complete for the current bounded slice
   - Go now serves:
     - IDE publish/list/latest routes for share and app deployments
     - deployment-mode current-session and state/project-config reads
     - deployment metadata catalog/version allocation
     - share/app publish-time snapshot materialization and policy writing
   - the remaining Phase 7 runtime gap is no longer deployment transport; it
     has shifted to launcher/bootstrap ownership

3. Bootstrap and launcher-origin handoff are still tied to Python routers
   - `backend/setta/routers/bootstrap.py` still carries launcher-origin trust
     and bootstrap payload behavior that will matter if launcher flows move

## Working Decisions

- treat Phase 6 MCP parity as complete and closed
- do not start Phase 7 by scattering one-off route ports across unrelated
  launcher, deployment, and bootstrap code paths
- inventory the remaining Python runtime surface first, then choose one bounded
  owner cluster with clear persistence/process boundaries
- prefer a cluster that already has partial Go runtime support underneath it
  when that yields a smaller and more coherent first Phase 7 slice
- treat deployment publication/listing as complete for the current bounded
  Phase 7 slice
- move the next Phase 7 plan to launcher/bootstrap ownership, because that is
  now the largest coherent Python-owned backend cluster left outside MCP

## Recommended Next Step

Create and execute the next focused Phase 7 slice for
`POST /openLauncherWorkspace` plus the launcher executable/target contract it
depends on.

That is now the highest-leverage next step because:

- the bounded deployment slice is complete end to end
- the dedicated launcher/bootstrap Phase 7 plan now exists
- the first launcher-mode route cluster is now complete in Go
- the remaining launcher prerequisite is concentrated around workspace-open
  handoff and launcher executable/bootstrap ownership

## Progress Notes

- 2026-03-08: completed the first Phase 7 runtime inventory pass and confirmed
  that the best bounded entry slice is share/app deployment publication and
  metadata listing above the already completed Go deployment session/state
  runtime.
- 2026-03-08: completed Stage 1 of that deployment slice by adding a Go-owned
  deployment catalog and version allocator in `internal/deployments/catalog.go`;
  next recommended step is the share deployment publish owner.
- 2026-03-08: completed Stage 2 by adding a Go-owned share deployment publish
  owner in `internal/deployments/share_publish.go`; next recommended step is
  the app deployment publish owner.
- 2026-03-08: completed Stage 3 by adding a Go-owned app deployment publish
  owner in `internal/deployments/app_publish.go`; next recommended step is the
  IDE publish/list/latest transport slice.
- 2026-03-08: completed Stage 4 by adding Go-owned IDE deployment
  publish/list/latest transport in `internal/httpapi/deployment_ide_routes.go`
  and wiring it from `internal/app/app.go`; next recommended step is a
  dedicated launcher/bootstrap Phase 7 plan doc.
- 2026-03-08: created
  `phase-7-launcher-management-and-bootstrap-plan.md`; next recommended step is
  Stage 1 from that doc: Go-owned IDE launcher management/status transport and
  runtime.
- 2026-03-08: after checking the current Go launcher entrypoint and route
  surface, revised the next recommended step to the launcher runtime
  prerequisite: launcher-mode home/runtime ownership plus a real launcher
  executable contract.
- 2026-03-08: split that launcher runtime prerequisite into a first bounded
  launcher-home slice for recent workspaces and directory browsing; this is now
  the recommended next step.
- 2026-03-08: completed that launcher-home recent-workspace and directory
  browser slice in Go; next recommended step is the focused
  `openLauncherWorkspace` plus launcher executable/target contract slice.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEModePublishesAndListsShareDeploymentsOverHTTP' -count=1 -timeout 420s`
