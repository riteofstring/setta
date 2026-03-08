# Phase 7 Deployment Publish And List Runtime

## Purpose

This doc scopes the first bounded Phase 7 implementation slice after the
completed Phase 6 MCP closeout and the initial Phase 7 runtime inventory.

The goal is to move share/app deployment publication and metadata listing into
explicit Go runtime owners above the already completed deployment session/state
runtime.

## Status

Current repo status as of 2026-03-08:

- Phase 7 runtime inventory is now the active rewrite handoff
- Go already owns:
  - deployment manifest and policy loading in `internal/deployments`
  - deployment catalog/list/latest reads plus version allocation in
    `internal/deployments/catalog.go`
  - share deployment publication from the live runtime snapshot in
    `internal/deployments/share_publish.go`
  - deployment runtime/session overlays in `internal/deployments/runtime.go`
  - deployment session/state/project-config read routes in
    `internal/httpapi/deployment_routes.go`
  - app-spec store and validation owners in `internal/appspec`
- Go does not yet own:
  - app deployment publication
  - thin IDE HTTP routes for those publish/list/latest flows

## Scope

This slice should cover:

- a Go-owned deployment metadata catalog and version allocator for:
  - `GET /share/deployments`
  - `GET /share/deployments/{deploymentName}/versions`
  - `GET /share/deployments/{deploymentName}/latest`
  - `GET /app/deployments`
  - `GET /app/deployments/{deploymentName}/versions`
  - `GET /app/deployments/{deploymentName}/latest`
- a Go-owned app deployment publish owner for:
  - composition or reuse of the completed share-deployment publish behavior
  - required app-definition/app-spec validation
  - app-spec copy/rebase into `app_specs/`
- thin IDE HTTP transport over those owners
- focused Go tests for the catalog, publish owner, and routes

## Non-Goals

- launcher or launch-intent flows
- launcher installation/status management
- bootstrap or launcher-origin handoff behavior
- deployment-mode served session/state/project-config routes already owned in Go
- listener session runtime behavior after deployment publication
- frontend UI changes beyond whatever existing transport the backend chooses to
  expose

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/routers/app_deployments.py`
- `tests/routers/test_share_deployments.py`
- `tests/routers/test_app_deployments.py`
- `internal/deployments/manifest.go`
- `internal/deployments/policy.go`
- `internal/deployments/runtime.go`
- `internal/httpapi/deployment_routes.go`
- `internal/httpapi/deployment_routes_test.go`
- `internal/projectstate`
- `internal/appspec`

## Current Python Behavior

1. Share deployment publish
   - blocks in deployment mode
   - publishes from the latest manager state, not from stale persisted project
     files
   - defaults to a share policy with `allowRun=false` and rejects
     `runSnapshotMode=never`
   - rewrites project-state file references to deployment-relative paths
   - copies structured-data sources using current in-memory values, including
     JSON, YAML, and TOML-backed sources
   - copies optional listener entrypoints into `listener/app.py`

2. App deployment publish
   - requires `appDefinition` plus a non-empty `appSpecPath`
   - copies the referenced AppSpec into the deployment under `app_specs/`
   - supports both absolute and `setta_files`-relative stored app-spec paths
   - uses app-mode policy defaults and also rejects `runSnapshotMode=never`
   - supports optional listener entrypoint copy

3. Deployment metadata listing
   - `list_*_deployments` returns deployment metadata sorted newest-first
   - `list_*_deployment_versions` returns versions newest-first for a name
   - `get_latest_*_deployment` returns the newest matching version
   - deployment-mode reads redact live served deployment paths when serving the
     current mounted deployment, but IDE-side listing returns actual metadata

## Relevant Go State

1. Existing foundation we should reuse
   - `internal/deployments` already normalizes manifests, policies, deployment
     roots, runtime roots, and session overlays
   - `internal/httpapi/deployment_routes.go` already serves current-session and
     per-session state/project-config reads for mounted deployments
   - `internal/appspec` already owns app-spec storage/validation for IDE-mode
     app-definition work

2. Missing owner seams
   - there is still no Go app deployment publish owner for app-definition
     validation, app-spec copy/rebase, and app-mode policy materialization
   - there are no IDE-mode Go routes for deployment publish/list/latest

## Working Decisions

- do not port Python router code or helper singletons 1:1
- keep deployment publication inside an explicit `internal/deployments` owner
  instead of spreading copy/rebase logic across route handlers
- treat the current project runtime snapshot as the source of truth for
  publication, not stale on-disk project files
- reuse shared app-spec ownership from `internal/appspec` instead of inventing
  a second app-spec copy path inside HTTP handlers
- prefer one coherent share/app deployment publication cluster before tackling
  launcher/bootstrap work

## Recommended Implementation Order

1. Deployment catalog and version-allocation owner
   - add typed metadata listing/latest helpers under `internal/deployments`
   - add deployment-name normalization plus next-version allocation
   - status: complete in `internal/deployments/catalog.go`

2. Share deployment publish owner
   - define an input/output boundary for publishing from a project snapshot
   - implement policy defaults, listener copy, path rebasing, and deployment
     asset/structured-data materialization
   - status: complete in `internal/deployments/share_publish.go`

3. App deployment publish extension
   - layer app-definition/app-spec requirements and app-spec copy/rebase on top
     of the share publish owner
   - next focused slice: move to `phase-7-app-deployment-publish-owner.md`

4. Thin IDE transport
   - register the list/latest/publish routes in IDE mode only
   - keep handlers limited to request decoding, mode checks, owner invocation,
     and response mapping

5. Focused verification
   - add deployment-owner tests covering:
     - latest in-memory project snapshot usage
     - path rebasing and copied files
     - YAML/TOML structured-data materialization
     - app-spec relative/absolute path handling
     - listener copy
     - newest-first version/latest metadata selection
   - add HTTP route coverage for the new IDE publish/list/latest surface

## Open Questions

- whether deployment publication should first target the existing frontend route
  shapes for convenience or introduce a cleaner Go-native route cluster and
  migrate frontend callers later
- how much of the Python structured-data save pipeline should be lifted into a
  reusable Go owner versus handled directly during the first publish slice
- whether deployment metadata listing should live entirely under
  `internal/deployments` or share a lower-level filesystem catalog helper with
  later launcher/runtime inventory work

## Progress Notes

- 2026-03-08: completed Stage 1 by adding a Go-owned deployment catalog and
  version allocator in `internal/deployments/catalog.go`, including newest-first
  list/version selection, latest-version lookup, deployment-name normalization,
  and focused catalog tests.
- 2026-03-08: completed Stage 2 by adding a Go-owned share deployment publish
  owner in `internal/deployments/share_publish.go`, including live runtime
  snapshot publication, asset/code/structured-data rebasing, listener copy, and
  focused publish tests.

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestRegisterDeploymentRoutes' -count=1 -timeout 300s`

## Next Recommended Step

Implement Stage 3 of this slice: the Go-owned app deployment publish owner in
`phase-7-app-deployment-publish-owner.md`, then layer thin IDE publish/list/latest
transport on top of the completed catalog and publish owners.
