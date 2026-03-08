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
  - local IDE/launcher session registration in
    `internal/localsessions/registry.go` and
    `cmd/setta-server/local_session.go`
  - bootstrap HTML at `GET /__setta__/bootstrap` in
    `internal/httpapi/bootstrap_page.go`
  - IDE launcher management/status routes in
    `internal/httpapi/launcher_management_routes.go`
  - launcher metadata/status and managed artifact ownership in
    `internal/launcher/metadata.go`,
    `internal/launcher/management.go`,
    `internal/launcher/artifacts.go`, and
    `internal/launcher/artifact_launch.go`
  - workspace launch-intent transport/runtime ownership in
    `internal/httpapi/workspace_launch_routes.go` and
    `internal/workspacelaunch/intents.go`
  - local `/launch` transport/runtime ownership in
    `internal/httpapi/workspace_launch_routes.go` and
    `internal/workspacelaunch/local_launch.go`
  - trusted frontend-origin storage/proof validation in
    `internal/frontendorigins/service.go`
  - bootstrap handoff parity for workspace-history and launcher-origin
    storage in `internal/httpapi/bootstrap_page.go` and
    `internal/httpapi/httpapi.go`
  - deterministic SSH parsing and remote payload utility ownership in
    `internal/sshx/foundation.go`
  - remote SSH command/session/tunnel runtime ownership in
    `internal/sshx/runtime.go` and `internal/sshx/tunnel.go`
- Python still appears to own major non-MCP backend surface in:
  - the SSH/remote `/launch` transport/runtime integration
  - launcher trust-persistence rollback behavior around launched remote
    workspaces
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
   - Go now owns the launcher-mode home/runtime browser slice:
     - `/launcherRecentWorkspaces`
     - `/addLauncherRecentWorkspace`
     - `/removeLauncherRecentWorkspace`
     - `/pinLauncherRecentWorkspace`
     - `/launcherFilesystemRoots`
     - `/listLauncherDirectory`
     - `/openLauncherWorkspace`
   - the remaining Python-owned launcher/runtime behavior is now concentrated
     in:
     - `/launch`
     - bootstrap/origin handoff policy around those flows
   - the next obvious Go slice is now launch/bootstrap handoff, not launcher
     management

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

Implement Stage 3 from
`phase-7-ssh-remote-launch-and-rollback.md`: Go-owned SSH/remote `/launch`
integration and rollback orchestration on top of the completed `internal/sshx`
runtime.

That is now the highest-leverage next step because:

- launcher management and local launch/bootstrap handoff are now complete in Go
- the dedicated Phase 7 SSH/remote follow-up plan now exists and its first two
  stages are complete
- the remaining Python-owned runtime gap is concentrated in the `/launch`
  integration layer and launcher trust-persistence rollback behavior above the
  new `internal/sshx` owner

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
- 2026-03-08: created
  `phase-7-launcher-open-workspace-and-bootstrap-contract.md` to split that
  next slice into a first executable/bootstrap prerequisite stage and a later
  `openLauncherWorkspace` route stage.
- 2026-03-08: completed that executable/bootstrap prerequisite stage in
  `cmd/setta-server/local_session.go`,
  `internal/localsessions/registry.go`,
  `internal/httpapi/bootstrap_page.go`, and `internal/config/config.go`; next
  recommended step is Stage 2: Go-owned `POST /openLauncherWorkspace`.
- 2026-03-08: completed Stage 2 from
  `phase-7-launcher-open-workspace-and-bootstrap-contract.md` by adding
  launcher workspace-open ownership in `internal/launcher/open_workspace.go`,
  local IDE session spawn/reuse in `internal/launcher/session_launcher.go`, and
  launcher-home transport wiring in `internal/httpapi/launcher_home_routes.go`;
  next recommended step is IDE launcher management/status ownership.
- 2026-03-08: completed Stage 1a launcher management/status ownership in
  `internal/launcher/metadata.go`,
  `internal/launcher/management.go`,
  `internal/httpapi/launcher_management_routes.go`, and
  `internal/app/app.go`; next recommended step is Stage 1b managed launcher
  artifact ownership.
- 2026-03-08: completed Stage 1b managed launcher artifact ownership in
  `internal/launcher/artifacts.go`,
  `internal/launcher/artifact_launch.go`,
  `internal/launcher/management.go`,
  `internal/httpapi/launcher_management_routes_test.go`, and
  `internal/app/launcher_management_test.go`; next recommended step is the
  remaining launch/bootstrap handoff slice.
- 2026-03-08: created
  `phase-7-launch-intent-local-launch-and-bootstrap-handoff.md` to split the
  remaining launcher gap into a first local handoff slice and a later SSH
  remote-launch follow-up.
- 2026-03-08: completed Stage 1 from
  `phase-7-launch-intent-local-launch-and-bootstrap-handoff.md` by adding the
  Go-owned workspace launch-intent runtime, the trusted frontend-origin store,
  `POST /createWorkspaceLaunchIntent`, and bootstrap-page parity for
  workspace-history plus launcher-origin handoff. The next recommended step is
  Stage 2: Go-owned local `/launch`.
- 2026-03-08: completed Stage 2 from
  `phase-7-launch-intent-local-launch-and-bootstrap-handoff.md` by adding the
  Go-owned local `/launch` runtime and transport, launcher-origin handoff
  proof append, launched workspace trust persistence, and rollback for newly
  started local sessions. The next recommended step is a dedicated SSH/remote
  launch follow-up plan doc.
- 2026-03-08: created
  `phase-7-ssh-remote-launch-and-rollback.md` to isolate the remaining
  SSH/remote `/launch` branch and remote rollback behavior from the completed
  local handoff slice.
- 2026-03-08: completed Stage 1 from
  `phase-7-ssh-remote-launch-and-rollback.md` by adding the deterministic
  `internal/sshx` foundation for SSH arg parsing, remote payload/session/
  connect-info parsing, remote log-path resolution, and tunnel utility logic.
  The next recommended step is Stage 2 from that doc: the remote connect and
  tunnel runtime.
- 2026-03-08: completed Stage 2 from
  `phase-7-ssh-remote-launch-and-rollback.md` by adding the Go-owned
  `internal/sshx` remote runtime/tunnel service and focused integration
  coverage. The next recommended step is Stage 3 from that doc: remote
  `/launch` integration and rollback orchestration.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEModePublishesAndListsShareDeploymentsOverHTTP' -count=1 -timeout 420s`
