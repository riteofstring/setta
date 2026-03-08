# Phase 7 Share Deployment Publish Owner

## Purpose

This doc scopes the next bounded Phase 7 slice after the completed deployment
catalog/version-allocation owner.

The goal is to move share deployment publication into an explicit Go runtime
owner before wiring any new IDE publish routes.

## Status

Current repo status as of 2026-03-08:

- Go already owns:
  - deployment manifest and policy loading in `internal/deployments`
  - deployment catalog/list/latest reads and version allocation in
    `internal/deployments/catalog.go`
  - deployment runtime/session overlays and mounted deployment read routes
  - app-spec store/validation ownership for later app deployment work
- Go does not yet own:
  - share deployment publication from the live project runtime snapshot
  - deployment asset/code/structured-data copy and path rebasing for publish
  - optional listener entrypoint copy during publish
  - thin IDE publish/list/latest routes above those owners
- nothing is currently in progress in the worktree

## Scope

This slice should cover:

- a Go-owned share deployment publish service in `internal/deployments`
- publication from the latest in-memory project runtime snapshot, not stale
  persisted project files
- share-policy normalization/defaulting plus
  `runSnapshotMode != never` validation
- deployment-root allocation via the completed catalog owner
- copy/rebase of deployment-relative artifacts, code files, and structured-data
  sources into the deployment root
- optional listener entrypoint copy into `listener/app.py`
- focused Go tests for publish semantics and copied output layout

## Non-Goals

- app deployment publication and app-spec copy/rebase
- IDE HTTP routes for publish/list/latest
- launcher/bootstrap work
- mounted deployment session/state/project-config reads already owned in Go

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-deployment-publish-and-list-runtime.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/deployments/publish_utils.py`
- `tests/routers/test_share_deployments.py`
- `internal/deployments/catalog.go`
- `internal/deployments/manifest.go`
- `internal/deployments/policy.go`
- `internal/projectstate`

## Current Python Behavior

1. Publish source of truth
   - share deployment publish uses the latest manager/runtime state, not stale
     persisted project files
   - publication chooses a default project config and writes deployment
     metadata rooted under `setta_files/deployments/<name>/vN`

2. Policy and manifest behavior
   - share publish defaults to a share policy with `allowRun=false`
   - publish rejects `runSnapshotMode=never`
   - the resulting manifest records deployment name, version, type, default
     project id, timestamp, and optional listener config

3. Materialization behavior
   - artifact paths are copied into `artifacts/`
   - code file bindings are copied into `code/`
   - structured-data sources are copied/rebased into `json_sources/`
   - JSON, YAML, and TOML-backed in-memory structured-data state is persisted
     into the published deployment
   - optional listener entrypoints are copied into `listener/app.py`

## Relevant Go State

1. Foundation already available
   - deployment catalog/version allocation is complete
   - deployment manifest/policy types already exist
   - project runtime/document ownership already exists in `internal/projectstate`

2. Missing owner seam
   - there is still no Go publish service that takes a live runtime snapshot,
     materializes deployment files, and writes manifest/policy/project payloads

## Working Decisions

- keep publish logic in an explicit `internal/deployments` service, not route
  handlers
- treat the current project runtime snapshot as the only publication source of
  truth
- reuse the completed catalog owner for deployment-root allocation instead of
  duplicating `vN` selection logic
- keep share publication separate from app publication so app-spec behavior does
  not broaden this slice
- prefer deterministic filesystem/layout rules over ad hoc path rewriting in
  transport code

## Recommended Implementation Order

1. Publish input/output boundary
   - define a service input that accepts runtime snapshot/document access,
     deployment name, default project id, policy override, and optional
     listener entrypoint
   - return typed deployment metadata rooted in the allocated deployment

2. Policy and manifest materialization
   - define/share the share policy defaults
   - validate `runSnapshotMode != never`
   - write manifest and policy payloads after normalization

3. Snapshot and filesystem materialization
   - clone the live project snapshot into the deployment root
   - copy/rebase artifact paths, code bindings, and structured-data sources
   - persist in-memory structured-data content for JSON/YAML/TOML sources
   - copy optional listener entrypoint into `listener/app.py`

4. Focused verification
   - add tests covering:
     - latest runtime snapshot usage
     - monotonically increasing deployment versions through the catalog
     - path rebasing and copied files
     - YAML/TOML structured-data materialization
     - listener copy

## Open Questions

- whether the structured-data materialization should live entirely inside the
  publish owner or split into a lower-level reusable deployment filesystem
  helper for later app deployment work
- whether publish metadata should reuse the existing route response shape
  exactly or map to it later in the transport layer

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -count=1 -timeout 300s`

## Next Recommended Step

Implement the Go-owned share deployment publish service in
`internal/deployments`, then add focused publish tests before exposing IDE-mode
HTTP routes.
