# Phase 7 Runtime Surface Inventory

## Purpose

This doc started the post-MCP handoff after the completed Phase 6 parity work.

The goal is to inventory the remaining Python-owned backend runtime surface
outside MCP so the rewrite can pick the first bounded Phase 7 owner without
guesswork. That inventory is complete for the deployment/launcher cluster that
Phase 7 actually implemented, but later review showed that the AI/chat runtime
was never part of that closeout and still remains Python-owned.

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
  - SSH/remote `/launch` transport/runtime integration and rollback ownership
    in `internal/workspacelaunch/remote_launch.go`
- Python still owns major non-MCP backend surface in:
  - `backend/setta/routers/ai.py` for managed chat, external-agent chat, and
    transcription routes
  - `backend/setta/llm/agent_runner.py` for managed Setta-LLM orchestration,
    live chat state, stop handling, and streaming fanout
  - `backend/setta/agentic/external_agent_runner.py` for the external-agent
    chat runtime
- Python still owns adjacent but out-of-scope CLI/distribution surface in:
  - `backend/setta/start.py`
  - the CLI-focused tests under `tests/start/`
  - installer/release scripts under `scripts/`
- current work in this doc is the historical closeout/scope-boundary pass for
  the deployment/launcher cluster, not a claim that every backend runtime owner
  already moved

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/routers/launch.py`
- `backend/setta/routers/launcher_home.py`
- `backend/setta/routers/status.py`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/routers/app_deployments.py`
- `backend/setta/routers/bootstrap.py`
- `backend/setta/start.py`
- `tests/start/test_ssh_connect.py`
- `cmd/setta-server/main.go`
- `internal/httpapi/deployment_routes.go`
- `internal/httpapi/workspace_launch_routes.go`
- `internal/deployments/runtime.go`
- `internal/workspacelaunch/remote_launch.go`
- `internal/sshx/runtime.go`
- `internal/app/app.go`

## Initial Observations

1. Launcher/runtime-control no longer looks like the remaining backend gap
   - Go now owns the launcher-mode home/runtime browser slice:
     - `/launcherRecentWorkspaces`
     - `/addLauncherRecentWorkspace`
     - `/removeLauncherRecentWorkspace`
     - `/pinLauncherRecentWorkspace`
     - `/launcherFilesystemRoots`
     - `/listLauncherDirectory`
     - `/openLauncherWorkspace`
   - Go now also owns:
     - `POST /createWorkspaceLaunchIntent`
     - local `POST /launch`
     - SSH/remote `POST /launch`
     - bootstrap/origin handoff policy around those flows
   - there is no obvious backend route/runtime gap left inside the launcher
     cluster

2. Deployment runtime handoff is now complete for the current bounded slice
   - Go now serves:
     - IDE publish/list/latest routes for share and app deployments
     - deployment-mode current-session and state/project-config reads
     - deployment metadata catalog/version allocation
     - share/app publish-time snapshot materialization and policy writing
   - deployment is no longer the source of the next backend rewrite slice, and
     the launcher/bootstrap follow-up that succeeded it is now complete too

3. The next step after the completed launcher/deployment slice is a fresh
   bounded phase, not another implicit launcher port
   - the inventory that started with deployment and launcher/bootstrap work no
     longer shows a clear remaining backend runtime owner inside that cluster
   - any follow-up should be selected deliberately as a new bounded slice, not
     assumed to be leftover `/launch` work

4. The remaining Python surface is not just CLI/distribution
   - `backend/setta/start.py` still owns adjacent shipped CLI/distribution
     surface
   - the launcher/deployment runtime side of those flows is already covered by
     `cmd/setta-server`, `internal/httpapi`, `internal/workspacelaunch`, and
     `internal/sshx`
   - separate AI/chat runtime ownership still remains in
     `backend/setta/routers/ai.py` and `backend/setta/llm/agent_runner.py`
   - the correct fix is a new bounded phase for AI/chat, not reopening the
     completed Phase 7 launcher work

## Working Decisions

- treat Phase 6 MCP parity as complete and closed
- treat deployment publication/listing and launcher/bootstrap ownership as
  complete for the current bounded Phase 7 slices
- close Phase 7 for the deployment/launcher cluster only
- do not treat Python CLI/distribution ownership as a hidden backend blocker
- track the remaining AI/chat runtime separately instead of relabeling it as
  launcher or CLI work
- scope any future Go CLI work separately instead of reopening Phase 7

## Recommended Next Step

Treat the deployment/launcher portion of Phase 7 as complete and keep the
remaining external-agent AI/runtime work on a separate track, now documented in
`phase-12-managed-chat-runtime-and-ai-route-foundation.md`.

That is now the highest-leverage next step because:

- the previously remaining `/launch` and rollback gap is complete in Go
- the current launcher/deployment inventory no longer shows a bounded runtime
  owner left in that cluster
- the still-Python-owned backend runtime that remains is now tracked as the
  external-agent AI stack, so continuing from a fresh bounded plan is more
  honest than stretching Phase 7

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
- 2026-03-08: completed Stage 3 from
  `phase-7-ssh-remote-launch-and-rollback.md` by adding the Go-owned remote
  `/launch` integration and rollback orchestration in
  `internal/workspacelaunch/remote_launch.go`, wiring
  `remoteCmdResolved` through the thin HTTP/app layer, and adding focused Go
  plus Python-reference verification. The next recommended step is to revisit
  the broader inventory instead of assuming more launcher work remains.
- 2026-03-08: re-read the current repo state against the Phase 7 inventory and
  confirmed that the launcher/deployment cluster was complete in Go.
- 2026-03-08: later repo-wide review after the Phase 11 CLI closeout found
  that AI/chat runtime ownership had not moved with the launcher/deployment
  work. The remaining backend gap is now tracked separately in
  `phase-12-managed-chat-runtime-and-ai-route-foundation.md`, while this doc
  remains the historical closeout record for the Phase 7 deployment/launcher
  slice.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/workspacelaunch -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMode(LaunchesRemoteWorkspaceOverHTTP|CreatesWorkspaceLaunchIntentsOverHTTP|RejectsWorkspaceLaunchWithoutIntentTokenOverHTTP)' -count=1 -timeout 420s`
- `source activate.sh && python -m pytest tests/routers/test_launch_routes.py -q -k 'launch_over_ssh_returns_bootstrap_url or launch_over_ssh_requires_remote_launcher_origin_proof or launch_over_ssh_uses_request_origin_for_handoff or remote_rollback_failed'`
