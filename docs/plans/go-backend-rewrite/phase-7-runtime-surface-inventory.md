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
- Python still appears to own major non-MCP backend surface in:
  - launcher and launch/session bootstrap flows
  - launcher installation and status management
  - share/app deployment publish and listing flows
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

2. Deployment runtime has partial Go ownership
   - Go already serves current-session and state/project-config reads for share
     and app deployments
   - Python still owns deployment publication plus deployment listing/latest
     metadata routes in `share_deployments.py` and `app_deployments.py`
   - current missing route overlap includes:
     - `GET /share/deployments`
     - `GET /share/deployments/{deploymentName}/versions`
     - `GET /share/deployments/{deploymentName}/latest`
     - `POST /share/deployments`
     - `GET /app/deployments`
     - `GET /app/deployments/{deploymentName}/versions`
     - `GET /app/deployments/{deploymentName}/latest`
     - `POST /app/deployments`
   - Python tests show that this slice depends on:
     - publish-time copy/rebase of artifacts, code files, and structured-data
       sources into the deployment root
     - share/app policy defaults and `runSnapshotMode != never`
     - monotonically increasing deployment version directories per deployment
       name
     - app-spec copy/rebase for app deployments
     - optional listener entrypoint copy into `listener/app.py`

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
- treat deployment publication/listing as the strongest first Phase 7
  candidate because Go already owns the deployment manifest/policy/session
  runtime below it
- keep launcher/bootstrap work deferred until deployment publication/listing is
  scoped cleanly, because launcher still spans auth handoff, filesystem
  browsing, OS integration, and origin-trust behavior

## Recommended Next Step

Move to the dedicated share-deployment publish implementation-plan doc in
`phase-7-share-deployment-publish-owner.md`.

That is now the highest-leverage next step because:

- Stage 1 deployment catalog/version allocation is complete
- Go already owns `internal/deployments` plus deployment read/session routes
- share deployment publish is now the smallest remaining deployment-runtime
  owner before app deployment publish and IDE transport

## Progress Notes

- 2026-03-08: completed the first Phase 7 runtime inventory pass and confirmed
  that the best bounded entry slice is share/app deployment publication and
  metadata listing above the already completed Go deployment session/state
  runtime.
- 2026-03-08: completed Stage 1 of that deployment slice by adding a Go-owned
  deployment catalog and version allocator in `internal/deployments/catalog.go`;
  next recommended step is the share deployment publish owner.

## Verification

- doc-only inventory update; no runtime or transport code changed
