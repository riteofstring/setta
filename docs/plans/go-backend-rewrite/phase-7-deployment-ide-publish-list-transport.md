# Phase 7 Deployment IDE Publish/List Transport

## Purpose

This doc scopes the remaining bounded Phase 7 deployment slice after the
completed catalog, share publish, and app publish owners.

The goal is to move the IDE-mode deployment publish/list/latest HTTP transport
into Go with thin handlers over the completed deployment owners.

## Status

Current repo status as of 2026-03-08:

- Go already owns:
  - deployment catalog/list/latest reads and version allocation in
    `internal/deployments/catalog.go`
  - share deployment publication in `internal/deployments/share_publish.go`
  - app deployment publication in `internal/deployments/app_publish.go`
  - deployment runtime/session overlays and deployment-mode read routes in
    `internal/httpapi/deployment_routes.go`
  - app-spec storage and validation in `internal/appspec`
- Go does not yet own:
  - IDE-mode share deployment list/latest/publish HTTP routes
  - IDE-mode app deployment list/latest/publish HTTP routes
  - route-level mode guards and response mapping for those owners
- nothing is currently in progress in the worktree

## Scope

This slice should cover:

- thin IDE-mode HTTP routes for:
  - `GET /share/deployments`
  - `GET /share/deployments/{deploymentName}/versions`
  - `GET /share/deployments/{deploymentName}/latest`
  - `POST /share/deployments`
  - `GET /app/deployments`
  - `GET /app/deployments/{deploymentName}/versions`
  - `GET /app/deployments/{deploymentName}/latest`
  - `POST /app/deployments`
- route-level mode checks that reject publish/list in deployment mode
- request decoding and response mapping over the completed deployment owners
- focused HTTP/app wiring tests for the new IDE transport

## Non-Goals

- deployment-mode session/state/project-config routes already owned in Go
- launcher/bootstrap work
- deployment runtime/session internals
- frontend UI changes

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-deployment-publish-and-list-runtime.md`
- `docs/plans/go-backend-rewrite/phase-7-app-deployment-publish-owner.md`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/routers/app_deployments.py`
- `tests/routers/test_share_deployments.py`
- `tests/routers/test_app_deployments.py`
- `internal/httpapi/deployment_routes.go`
- `internal/httpapi/deployment_routes_test.go`
- `internal/deployments/catalog.go`
- `internal/deployments/share_publish.go`
- `internal/deployments/app_publish.go`
- `internal/app/app.go`

## Current Python Behavior

1. IDE list/latest behavior
   - list routes return newest-first deployment metadata with actual deployment
     roots and policy paths in IDE mode
   - latest routes return the newest matching deployment version
   - deployment mode rejects IDE list routes

2. IDE publish behavior
   - publish routes reject deployment mode
   - share publish uses the current project manager/runtime plus share policy
     overrides and optional listener entrypoint
   - app publish uses the current project manager/runtime plus app-policy
     overrides and optional listener entrypoint
   - publish responses return deployment metadata for the newly created version

3. Transport shaping
   - handlers are primarily request decoding, mode gating, owner invocation,
     and metadata response shaping
   - current frontend callers still target the existing Python route paths

## Relevant Go State

1. Foundation already available
   - `internal/deployments/catalog.go` already owns newest-first list/latest
     metadata reads
   - `internal/deployments/share_publish.go` and
     `internal/deployments/app_publish.go` already own publish-time filesystem
     materialization
   - `internal/httpapi/deployment_routes.go` already owns deployment-mode
     session/state transport patterns

2. Missing transport seam
   - there is still no IDE-mode route registration for share/app deployment
     list/latest/publish over those owners

## Working Decisions

- keep transport thin: decode, mode-check, invoke owner, map response
- prefer reusing the existing frontend-facing route paths unless a cleaner
  route shape materially reduces complexity
- keep IDE-mode publish/list transport separate from deployment-mode read route
  registration if that keeps mode boundaries clearer
- do not reintroduce Python manager wrappers or compatibility shims

## Recommended Implementation Order

1. Route dependency boundary
   - define explicit HTTP dependencies for the deployment catalog plus the
     share/app publish owners
   - wire those dependencies in IDE mode from `internal/app`

2. Share/app list/latest routes
   - add thin handlers for share and app metadata listing/latest
   - reuse the catalog owner as the only metadata source of truth

3. Share/app publish routes
   - add thin handlers for share and app publish requests
   - keep request structs limited to owner inputs plus route-mode checks

4. Focused verification
   - add HTTP route tests covering:
     - IDE-mode publish success for share and app
     - list/latest responses sorted and filtered correctly
     - deployment-mode rejection for IDE publish/list routes
     - listener/config override request decoding

## Open Questions

- whether these IDE-mode routes should be registered in
  `internal/httpapi/deployment_routes.go` or a separate deployment IDE route
  file to keep deployment-mode and IDE-mode seams distinct
- whether the metadata response should reuse the current frontend route shape
  exactly or add the internal `deploymentType` field now that Go owns the
  transport

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestRegisterDeploymentRoutes' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestApp.*Deployment' -count=1 -timeout 420s`

## Next Recommended Step

Implement the IDE-mode share/app deployment publish/list/latest HTTP transport
over the completed deployment owners.
