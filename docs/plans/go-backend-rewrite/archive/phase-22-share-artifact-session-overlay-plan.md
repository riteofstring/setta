# Phase 22 Share Artifact Session Overlay Plan

## Purpose

This doc narrows the remaining Phase 22 work into the concrete
share/deployment artifact overlay slice.

Phase 22 Slice 2 intentionally kept `internal/artifacts` IDE-only. The live
frontend still uses the cached artifact load and artifact mutation routes in
deployment modes through the shared endpoint helpers, so the remaining gap is
not dormant parity work. It is a bounded per-session overlay owner over the
deployment runtime.

## Status

Landed on 2026-03-10.

Completed in this slice:

- new explicit `internal/shareartifacts` owner for deployment/share-session
  cached reads, in-memory updates/deletes, deployment-relative id
  normalization, and share-session overlay cleanup
- thin `internal/httpapi` deployment-mode transport over
  `RequireShareSession(...)` for:
  - `POST /loadCachedImageArtifacts`
  - `POST /loadCachedChartData`
  - `POST /loadCachedBrushStrokes`
  - `POST /loadDrawAreaLayerItemTransform`
  - `POST /updateArtifacts`
  - `POST /deleteArtifacts`
- Go `UpdateArtifacts` frontend websocket messages scoped by share session
- real app wiring plus focused service/route/app coverage

Status before this slice:

- Phase 22 Slice 1 is landed for the workspace file-browser and binary
  download surface
- Phase 22 Slice 2 is landed for the IDE-only artifact owner
- the remaining caller-backed Phase 22 gap is now deployment/share-session
  behavior for:
  - `POST /loadCachedImageArtifacts`
  - `POST /loadCachedChartData`
  - `POST /loadCachedBrushStrokes`
  - `POST /loadDrawAreaLayerItemTransform`
  - `POST /updateArtifacts`
  - `POST /deleteArtifacts`

This slice does not reopen `POST /importFilesToArtifacts`.

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-22-artifact-and-file-browser-route-cluster-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-22-ide-artifact-owner-plan.md`
- `backend/setta/routers/artifact.py`
- `backend/setta/share/policy.py`
- `tests/routers/test_share_artifacts.py`
- `frontend/src/utils/endpointUtils.ts`
- `frontend/src/state/hooks/artifacts.ts`
- `frontend/src/state/actions/artifacts.ts`
- `frontend/src/state/actions/websocketReceive.ts`
- `internal/deployments/runtime.go`
- `internal/deployments/policy.go`
- `internal/httpapi/artifact_routes.go`
- `internal/httpapi/deployment_routes.go`
- `internal/realtime/websocket_hub.go`
- `internal/realtime/registry.go`

## Caller-Backed Surface

Concrete active caller needs today:

- deployment/share image, chart, brush-stroke, and transform loads still go
  through the cached artifact routes
- deployment/share param UIs and draw-area edits still post artifact updates
  through the same generated endpoints
- deployment/share file removal still posts `deleteArtifacts`
- deployment/share frontend websocket reducers already consume
  `UpdateArtifacts` messages

## Clean-Break Decisions

1. Keep the IDE and deployment owners separate.
   - do not broaden `internal/artifacts` into a mixed disk-plus-session owner
   - add a separate bounded deployment-session artifact owner
2. Use deployment-session overlays as the source of truth for mutable
   deployment artifact state.
   - disk under the deployment root is the durable fallback for cached reads
   - deployment updates and deletes stay in memory for the active share
     session
3. Normalize public ids relative to the deployment root.
   - accept absolute or relative deployment paths
   - return deployment-relative ids like `artifacts/...`
4. Keep mutation policy explicit.
   - `deployments.Policy.AllowParamChanges == false` returns typed `403`
   - do not add fallback heuristics or hidden mutation escapes
5. Reuse the existing frontend websocket contract.
   - add Go `UpdateArtifacts` websocket messages instead of inventing a new
     deployment-specific artifact event

## Desired Go Boundary

Add a new explicit deployment artifact owner with bounded operations:

- load cached image/chart/brush/transform artifacts for one share session
- update deployment artifacts in that session overlay
- delete deployment file artifacts in that session overlay
- emit scoped websocket `UpdateArtifacts` messages for non-file deployment
  updates and deletes
- drop overlay state when a share session expires

Recommended package: `internal/shareartifacts`.

It should depend on:

- `*deployments.Runtime`
- `*binary.Store`
- `*realtime.WebsocketHub`

It should not depend on:

- the IDE artifact service
- route files for id normalization or share-policy logic
- a Python-shaped session artifact manager graph

## Session Overlay Shape

Each share session should own an in-memory overlay keyed by normalized absolute
deployment paths.

Per-path overlay entries should track:

- artifact type
- normalized public id
- cached artifact payload
- delete tombstone state for file artifacts

Overlay lookup rules:

1. normalize the incoming path against the deployment root
2. if the session overlay has a live entry for that resolved path, return it
3. if the session overlay has a delete tombstone for that resolved path, treat
   it as missing
4. otherwise load from deployment disk and normalize the id relative to the
   deployment root

This slice only needs in-process session overlays. No cross-process overlay
persistence is required.

## Path And ID Rules

Cached-load and update inputs should accept deployment-relative or absolute
paths, but they must resolve under the bounded deployment roots already used by
the current product:

- `artifacts/`
- `json_sources/`
- `code/`

Delete inputs remain narrower:

- only `File` deletes are supported
- delete targets must resolve under the deployment `artifacts/` root

Returned ids and websocket payload ids should always be deployment-relative
slash paths.

## Cached Load Rules

For each requested path:

- resolve and validate against the bounded deployment roots
- serve the session overlay artifact first when present
- respect delete tombstones as `null`
- otherwise read from deployment disk and materialize:
  - `ImageArtifact` through the Go binary store
  - `ChartDataArtifact` by CSV parse
  - `BrushStrokeArtifact` and
    `DrawAreaLayerItemTransformArtifact` by canonical JSON parse
- return `null` for missing files after path validation succeeds

## Update Rules

For deployment/share mode:

- require a valid share session id
- enforce `AllowParamChanges`
- accept the current caller-backed artifact set:
  - `File`
  - `Image`
  - `ChartData`
  - `BrushStroke`
  - `DrawAreaLayerItemTransform`
- keep the updates in memory only for the targeted share session
- return synthetic `saved` results with normalized deployment-relative ids
- broadcast `UpdateArtifacts` only for non-file artifacts, scoped to the same
  share session

Unlike the IDE owner, this slice should not reapply disk conflict handling.
The overlay is the source of truth for mutable deployment-session state.

## Delete Rules

For deployment/share mode:

- require a valid share session id
- enforce `AllowParamChanges`
- only support `File` deletes
- record delete tombstones in the session overlay instead of mutating
  deployment disk
- return normalized deployment-relative ids
- do not broadcast file-only delete events in this slice unless a concrete
  caller proves that need

## Websocket Contract

Add Go support for the existing frontend `UpdateArtifacts` message:

- `messageType: "UpdateArtifacts"`
- `content.artifacts`
- `content.updateType`

Broadcast rules for this slice:

- target `realtime.Selection{Type: Frontend, ShareSessionID: <session>}`
- send only to the active share session
- send `updateType: "update"` for non-file deployment updates
- keep message ids optional like other lightweight frontend events

## Transport Boundary

`internal/httpapi` should stay thin:

- keep `POST /importFilesToArtifacts` behind `RequireFullIDERuntime`
- in IDE mode, keep the existing `internal/artifacts` owner for all artifact
  routes
- in deployment modes, register:
  - cached loads
  - `updateArtifacts`
  - `deleteArtifacts`
  behind `RequireShareSession(...)` and delegate to the new deployment-session
  owner

Do not duplicate deployment-session lookup or websocket selection logic in the
route handlers beyond extracting the resolved share session id.

## Cleanup Boundary

When deployment sessions expire:

- drop terminal state as already implemented
- drop listener share-session state as already implemented
- drop deployment artifact overlay state for that session in the new owner

## Verification

Completed verification:

- `./scripts/go.sh test ./internal/shareartifacts ./internal/httpapi ./internal/realtime ./internal/app -run 'Test(NewUpdateArtifactsMessage|Service(UpdateAndLoadUsePerSessionOverlayAndLeaveDiskUntouched|DeleteIsInMemoryOnlyAndNormalizesIDs|DeleteShareSessionDropsOverlayState|UpdateRejectsPolicyDenied)|RegisterArtifactRoutes(ShareModeUpdatesAndLoadsOverlay|ShareModeRejectsPolicyDenied|RoundTripAndUnsupportedUpdate|BlocksLauncherMode)|AppShareModeServesArtifactOverlayRoutesAndBroadcastsScopedUpdates|CleanupExpiredDeploymentSessionsDropsTerminalAndRealtimeState)' -count=1`

## Next Recommended Step

Phase 22 is now closed for the current caller-backed artifact/file-browser
cluster. The next recommended step is a broader rerank outside this cluster
instead of reopening artifact transport.
