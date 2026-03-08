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
- Python still appears to own major non-MCP backend surface in:
  - launcher and launch/session bootstrap flows
  - launcher installation and status management
  - share/app deployment publish and listing flows
  - bootstrap and launcher-origin handoff behavior around launched workspaces

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
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
   - there is no obvious Go HTTP route cluster that owns those flows today

2. Deployment runtime has partial Go ownership
   - Go already serves current-session and state/project-config reads for share
     and app deployments
   - Python still owns deployment publication plus deployment listing/latest
     metadata routes in `share_deployments.py` and `app_deployments.py`

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

## Recommended Next Step

Execute a focused inventory and scoping pass for launcher/runtime-control and
deployment publication/listing routes, then choose the smaller coherent entry
slice.

The current recommended option is to start with the deployment publication and
listing cluster because:

- Go already owns `internal/deployments` plus deployment read/session routes
- that makes publish/list parity a smaller extension of an existing Go runtime
  owner than the launcher stack, which still lacks a clear Go route/runtime
  boundary
- launcher/bootstrap work still appears to span more OS integration, auth
  handoff, and frontend-origin trust behavior

## Verification

- doc-only inventory update; no runtime or transport code changed
