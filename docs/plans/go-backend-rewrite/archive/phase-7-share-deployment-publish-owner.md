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
  - share deployment publication from the live project runtime snapshot in
    `internal/deployments/share_publish.go`
  - deployment runtime/session overlays and mounted deployment read routes
  - app-spec store/validation ownership for later app deployment work
- Go does not yet own:
  - app deployment publication layered on top of the completed share publish
    owner
  - thin IDE publish/list/latest routes above those owners
- nothing is currently in progress in the worktree

## Scope

This slice covered:

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

- `docs/plans/go-backend-rewrite/archive/phase-7-deployment-publish-and-list-runtime.md`
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

2. Completed owner seam
   - Go now has a publish service that takes a live runtime snapshot,
     materializes deployment files, and writes manifest/policy/project payloads
   - `internal/projectstate/effective_payload_exports.go` exposes the bounded
     payload helpers needed to derive structured-data payloads without
     broadening deployment logic into HTTP transport

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
- resolve relative publish paths against explicit roots:
  - `artifacts/`, `code/`, and `json_sources/` against `setta_files`
  - other relative paths against the workspace root
- preserve deployment-relative directory layout for managed `setta_files`
  sources, but hash external filenames to avoid collisions
- materialize structured-data files from the live code-object tree and support
  JSON, YAML, and TOML output directly in the publish owner
- strip password-param secrets from the published snapshot with
  `hasSecret=false`

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

## Progress Notes

- 2026-03-08: completed this slice in `internal/deployments/share_publish.go`
  and `internal/deployments/share_publish_test.go`, including live runtime
  snapshot publication, policy/manifest writing, listener copy, asset/code/path
  rebasing, JSON/YAML/TOML structured-data materialization, and password-value
  stripping.

## Open Questions

- whether the app deployment slice should reuse the share publish owner via a
  shared lower-level copy/rebase helper or compose it through a higher-level
  deployment publisher façade
- whether the eventual IDE publish/list/latest transport should keep the
  existing route shapes exactly or map from a cleaner Go-native owner result

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test(BuildDrawSnapshotPath|RuntimeSetDrawSectionRenderedImagePaths|RuntimeSetSectionParamFilter|RuntimeSetMetaControlShowSectionTitle)' -count=1 -timeout 300s`

## Next Recommended Step

Implement the Go-owned app deployment publish owner in
`phase-7-app-deployment-publish-owner.md`, reusing the completed share publish
owner and the existing `internal/appspec` foundation before exposing IDE-mode
publish/list/latest routes.
