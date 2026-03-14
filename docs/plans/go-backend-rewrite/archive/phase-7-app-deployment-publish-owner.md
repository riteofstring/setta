# Phase 7 App Deployment Publish Owner

## Purpose

This doc scopes the next bounded Phase 7 slice after the completed share
deployment publish owner.

The goal is to move app deployment publication into an explicit Go runtime
owner before wiring any new IDE publish routes.

## Status

Current repo status as of 2026-03-08:

- Go already owns:
  - deployment catalog/list/latest reads and version allocation in
    `internal/deployments/catalog.go`
  - share deployment publication from the live project runtime snapshot in
    `internal/deployments/share_publish.go`
  - app deployment publication from the live project runtime snapshot in
    `internal/deployments/app_publish.go`
  - app-spec store and validation ownership in `internal/appspec`
  - document-level app-definition read/write/stream owners in
    `internal/projectstate`
  - deployment runtime/session overlays and mounted deployment read routes
- Go does not yet own:
  - thin IDE publish/list/latest routes above those owners
- nothing is currently in progress in the worktree

## Scope

This slice covered:

- a Go-owned app deployment publish service in `internal/deployments`
- publication from the latest in-memory project runtime snapshot, not stale
  persisted project files
- required `Document.AppDefinition` presence plus non-empty `appSpecPath`
  validation
- app deployment policy normalization/defaulting plus
  `runSnapshotMode != never` validation
- app-spec copy/rebase into deployment `app_specs/` with support for:
  - IDE-managed relative `app_specs/...` paths
  - absolute stored app-spec paths under the project root
- manifest materialization with `deploymentType=app`
- focused Go tests for publish semantics, app-spec copy/rebase, and listener
  behavior

## Non-Goals

- thin IDE HTTP routes for publish/list/latest
- deployment session/state read routes already owned in Go
- launcher/bootstrap work
- frontend UI changes
- app deployment mounted runtime behavior after publication

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-7-deployment-publish-and-list-runtime.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-share-deployment-publish-owner.md`
- `backend/setta/routers/app_deployments.py`
- `tests/routers/test_app_deployments.py`
- `internal/deployments/share_publish.go`
- `internal/deployments/catalog.go`
- `internal/deployments/manifest.go`
- `internal/deployments/policy.go`
- `internal/appspec`
- `internal/projectstate/app_definition_writes.go`
- `internal/projectstate/app_definition_reads.go`

## Current Python Behavior

1. Publish preconditions
   - app deployment publish requires a project config id present in the current
     project state
   - publish fails when `appDefinition` is missing
   - publish fails when `appDefinition.appSpecPath` is blank

2. Policy and manifest behavior
   - app publish defaults to:
     - `allowParamChanges=true`
     - `allowVariantChanges=false`
     - `allowLayoutChanges=false`
     - `allowRun=true`
     - `allowLLM=false`
     - `allowExternalLinks=false`
     - `allowFileDownloads=false`
     - `allowMultipleRuns=true`
     - `runSnapshotMode=ephemeral`
   - publish rejects `runSnapshotMode=never`
   - the resulting manifest records deployment name, version, type, default
     project id, timestamp, and optional listener config

3. Materialization behavior
   - publication starts from the same live runtime snapshot semantics as share
     deployment publish
   - artifact/code/json-source rebasing follows the same publish rules as share
     deployments
   - if `appDefinition.appSpecPath` points under `app_specs/`, the deployment
     preserves that relative path
   - otherwise the deployment copies the spec into `app_specs/` using an
     externalized filename
   - the published project snapshot stores the rebased relative app-spec path

## Relevant Go State

1. Foundation already available
   - `internal/deployments/share_publish.go` already owns the live runtime
     snapshot clone, path rebasing, policy/manifest writing, structured-data
     materialization, and listener copy for share deployments
   - `internal/appspec` already owns app-spec path normalization plus JSON
     read/write and validation
   - `internal/projectstate` already owns app-definition metadata reads/writes

2. Completed owner seam
   - Go now has an app deployment publish owner that validates
     `AppDefinition`, validates the stored app spec through
     `Runtime.ValidateAppDefinition`, applies app-mode policy defaults, writes
     an app manifest, and persists the deployment-local app spec under
     `app_specs/`

## Working Decisions

- keep app deployment publication in `internal/deployments`, not HTTP handlers
- reuse the completed share publish owner for live snapshot cloning and
  filesystem materialization wherever that does not distort app-specific
  behavior
- treat `Document.AppDefinition` plus the stored app spec as the only source of
  truth for app deployment publication
- preserve IDE-managed `app_specs/...` relative paths in the published
  snapshot when possible
- use `internal/appspec` JSON read/write as the app-spec source of truth during
  publication instead of copying raw bytes or inventing a second path policy
- validate the current stored app spec against the current app-definition
  metadata before publication and fail explicitly on validation errors
- do not route app deployment publish back through Python or introduce
  compatibility shims

## Recommended Implementation Order

1. App publish input/output boundary
   - define a service input that accepts runtime access, deployment name,
     default project id, app-policy overrides, and optional listener entrypoint
   - return typed deployment metadata rooted in the allocated deployment

2. App-definition and app-spec validation
   - require `Document.AppDefinition`
   - require a non-empty configured `appSpecPath`
   - load or resolve the stored app spec through a robust Go owner path

3. App publish materialization
   - reuse or compose the share publish owner to materialize the live runtime
     snapshot into the deployment root
   - copy/rebase the app spec into deployment `app_specs/`
   - rewrite `Document.AppDefinition.AppSpecPath` to the deployment-relative
     target path
   - write an app deployment manifest and app-mode policy

4. Focused verification
   - add tests covering:
     - missing `appDefinition`
     - blank `appSpecPath`
     - relative and absolute app-spec path publication
     - app policy defaults and `runSnapshotMode=never` rejection
     - listener copy on app deployment publish

## Progress Notes

- 2026-03-08: completed this slice in `internal/deployments/app_publish.go`
  and `internal/deployments/app_publish_test.go`, including app-definition
  precondition checks, app-mode policy defaults, app-spec read/validation and
  deployment-local write, listener copy, and focused publish tests for missing
  metadata, relative and absolute app-spec paths, invalid specs, and
  `runSnapshotMode=never`.

## Open Questions

- whether the upcoming transport slice should keep the current Python/Frontend
  route paths exactly or expose a cleaner Go-native route cluster and migrate
  callers later
- whether share/app publish and list/latest handlers should live beside the
  existing deployment-mode route registration or in a separate IDE-only route
  file

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(GetAppDefinition|ValidateAppDefinition|SetAppDefinition|UpdateAppDefinition|StreamAppDefinition)' -count=1 -timeout 300s`

## Next Recommended Step

Implement the thin IDE deployment publish/list/latest transport in
`phase-7-deployment-ide-publish-list-transport.md` over the completed
catalog, share publish, and app publish owners.
