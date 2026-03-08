# Phase 22 Artifact And File Browser Route Cluster Plan

## Purpose

This doc records the next caller-backed direct-frontend phase after the landed
Phase 20 git-read closeout and the corrected Phase 21 rerank.

The earlier post-git rerank was too narrow. A deeper audit of the live
frontend found that the artifact and workspace file-browser surface is still
actively caller-backed and still Python-owned:

- workspace file browsing and file preview/editor reads
- workspace file writes, moves, and copies
- token-backed workspace file downloads
- binary payload download for previews and editors
- artifact import/update/delete for chat attachments, dropzones, and browser
  surfaces
- cached artifact reads for image/chart/draw-area callers

Those routes are the next highest-leverage direct transport/runtime gap because
they remain a live user-facing workflow across Overview Explorer, Home
workspace browsing, Browser sections, spreadsheet preview/editing, chat
attachments, deployment publish modals, and artifact-backed param UIs.

## Status

Current repo status as of 2026-03-10 after the landed Slices 1, 2, and 3:

- Phase 19 project-shell route ownership is complete for the current
  caller-backed surface
- Phase 20 git-read route ownership is complete for the current caller-backed
  surface
- the earlier Phase 21 rerank doc initially concluded that no remaining
  caller-backed direct frontend cluster existed, but a rerun against the live
  frontend corrected that result and drove this phase
- the workspace file-browser and download subset is now Go-owned:
  - `POST /checkIfFileExists`
  - `POST /checkWorkspaceInitialized`
  - `POST /getFileBrowserRoot`
  - `POST /getFolderContents`
  - `POST /getFileBrowserDownloadUrls`
  - `POST /getFileBrowserFileContent`
  - `POST /getFileBrowserFileStat`
  - `POST /writeFileBrowserFileContent`
  - `POST /transferFileBrowserEntry`
  - `GET /fileBrowser/{token}`
  - `GET /binary/{contentId}`
- the IDE artifact owner surface is now also Go-owned:
  - `POST /importFilesToArtifacts`
  - `POST /loadCachedImageArtifacts`
  - `POST /loadCachedChartData`
  - `POST /loadCachedBrushStrokes`
  - `POST /loadDrawAreaLayerItemTransform`
  - `POST /updateArtifacts`
  - `POST /deleteArtifacts`
- the deployment/share overlay follow-on is now also Go-owned for the active
  cached-load and mutation routes
- there is no remaining caller-backed Phase 22 gap inside this cluster

## Scope

Caller-backed route surface for this phase:

- `POST /checkIfFileExists`
- `POST /checkWorkspaceInitialized`
- `POST /getFileBrowserRoot`
- `POST /getFolderContents`
- `POST /getFileBrowserDownloadUrls`
- `POST /getFileBrowserFileContent`
- `POST /getFileBrowserFileStat`
- `POST /writeFileBrowserFileContent`
- `POST /transferFileBrowserEntry`
- `GET /fileBrowser/{token}`
- `POST /importFilesToArtifacts`
- `POST /loadCachedImageArtifacts`
- `POST /loadCachedChartData`
- `POST /loadCachedBrushStrokes`
- `POST /loadDrawAreaLayerItemTransform`
- `POST /updateArtifacts`
- `POST /deleteArtifacts`
- `GET /binary/{contentId}`

Explicit non-goals for the first artifact/file-browser phase:

- broad recreation of the Python `Artifacts` manager object graph
- unrelated listener-chat, detached-run, or dormant default-project routes
- deployment-mode file browsing enablement beyond explicit current policy
- broad launcher/home redesign outside the existing caller-backed file-browser
  behaviors
- inventing heuristic artifact-storage shortcuts when a typed binary or
  artifact owner should be the source of truth

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-21-post-git-direct-frontend-route-inventory-and-rerank.md`
- `backend/setta/routers/artifact.py`
- `backend/setta/routers/binary.py`
- `tests/routers/test_file_browser_routes.py`
- `tests/routers/test_share_artifacts.py`
- `docs/reference/file-browser-pane.md`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserUniversalPreview.tsx`
- `frontend/src/components/Section/Layouts/BrowserArea.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
- `frontend/src/components/Chat/useChatAttachmentManager.ts`
- `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`
- `frontend/src/components/App/appRegistry.tsx`
- `frontend/src/state/hooks/artifacts.ts`
- `frontend/src/state/actions/artifacts.ts`
- `frontend/src/utils/nativeFileImport.ts`
- `frontend/tests/e2e/file-browser`
- `frontend/tests/e2e/chat`
- `internal/binary/store.go`
- `internal/httpapi/binary_routes.go`
- `internal/app/app.go`

## Existing Go Foundations

- `internal/binary`
  - explicit payload store with durable/non-durable content refs and upload
    size enforcement
- `internal/httpapi`
  - thin route registration, IDE/launcher/deployment mode guards, and typed
    error mapping patterns
- `internal/app`
  - explicit real-app wiring for route owners instead of implicit globals
- `internal/launcher`
  - bounded artifact launch helpers that prove artifact-related logic does not
    need to live in route files

What is still missing:

- no caller-backed transport/runtime gap remains inside this cluster

## Desired Go Boundaries

### 1. `internal/filebrowser` owns workspace file-browser semantics

This owner should handle:

- workspace-root-relative and explicit-absolute path resolution
- allow-outside-workspace-root policy for the bounded callers that need it
- default ignore patterns and internal Setta path suppression
- folder listing, root metadata, initialization checks, and file stat reads
- file-content read/write with explicit size caps and `mtimeNs` concurrency
- move/copy transfer validation
- file-browser download token mint/validate plus resolved file responses

It should not live in route handlers.

### 2. `internal/artifacts` owns artifact persistence and cached reads

This owner should handle:

- import-from-workspace into artifact storage through the Go binary store
- typed cached artifact reads for image/chart/brush-stroke/transform payloads
- artifact update/delete ownership for IDE and deployment/share flows
- attachment-policy enforcement based on explicit upload scope
- share/deployment-session in-memory overlay behavior where current product
  semantics require it

It should not recreate the Python manager graph. The owner should expose
bounded operations around concrete route use cases.

### 3. `internal/binary` remains the payload source of truth

Recommendation:

- keep raw bytes in `internal/binary.Store`
- add Go binary download transport over the same store instead of creating a
  second file-serving path
- reuse binary refs in file-browser content reads and artifact import/update
  flows

### 4. `internal/httpapi` keeps transport thin

The HTTP layer should only own:

- request decoding
- mode/policy gates
- typed error mapping
- delegation to explicit file-browser, artifact, and binary owners

It should not own:

- path normalization
- token mint/validation
- artifact persistence rules
- share-session overlay logic

## Python Reference Behaviors To Preserve As Product Semantics

Read the current Python code/tests as product reference material:

- deployment/share mode blocks the file-browser routes with explicit `403`
- `checkIfFileExists` stays workspace-root constrained outside deployment mode
  unless a route explicitly opts into absolute-path browsing
- `getFolderContents` keeps folders before files, case-insensitive name sort,
  ignore-pattern filtering, hidden-file filtering, and bounded entry counts
- `checkWorkspaceInitialized` and folder listings use explicit Setta-root
  checks instead of heuristic keyword matching
- file-content reads use a hard max size, detect on-disk mutation during the
  read, and return binary content refs instead of inline file bytes
- file-content writes use `expectedMtimeNs` as the source-of-truth conflict
  check and support create-only writes when it is `null`
- transfer operations reject self-descendant folder moves and preserve copy
  auto-renaming semantics
- binary and file-browser download routes validate explicit tokens or content
  ids instead of inferring file access from arbitrary paths
- share/deployment artifact updates are in-memory and policy-gated, with
  artifact ids normalized relative to the deployment root

These behaviors matter. The Python router/module shape does not.

## Planned Slices

### Slice 1: Workspace file-browser owner and download transports

Routes:

- `POST /checkIfFileExists`
- `POST /checkWorkspaceInitialized`
- `POST /getFileBrowserRoot`
- `POST /getFolderContents`
- `POST /getFileBrowserDownloadUrls`
- `POST /getFileBrowserFileContent`
- `POST /getFileBrowserFileStat`
- `POST /writeFileBrowserFileContent`
- `POST /transferFileBrowserEntry`
- `GET /fileBrowser/{token}`
- `GET /binary/{contentId}`

Deliverables:

- new explicit `internal/filebrowser` owner for workspace path handling and
  file-browser semantics
- Go binary download transport over the existing `internal/binary.Store`
- thin route registration and real app wiring
- focused tests in service, route, and app layers

Why this goes first:

- it is the live explorer/home/browser-section/spreadsheet-preview surface
- it keeps the first slice bounded to workspace files and existing binary
  payload storage
- artifact mutation semantics can build on the same path and binary boundary
  afterward

Status:

- landed on 2026-03-10

Completed in this slice:

- new explicit `internal/filebrowser` owner for workspace path handling,
  internal-root suppression, initialization checks, file-content read/write,
  transfer semantics, and token-backed workspace downloads
- Go `GET /binary/{contentId}` download transport over the existing
  `internal/binary.Store`
- thin `internal/httpapi` transport plus real IDE app wiring
- focused service, route, binary-route, and app coverage

Decisions recorded in this slice:

- the live frontend download route is `GET /fileBrowser/{token}`; the earlier
  `/fileBrowserDownload` wording in planning text was stale and is corrected
  here
- Go file-browser routes explicitly return `403 "File browsing is disabled in
  deployment mode."` in share/app modes instead of relying on generic
  deployment route gating
- Go `GET /binary/{contentId}` is currently bounded to the active IDE caller
  surface because the live callers are file-browser preview/editor paths; any
  broader share/app download-policy parity remains out of scope until a
  concrete caller requires it

### Slice 2: IDE artifact import, cached reads, and mutation ownership

Routes:

- `POST /importFilesToArtifacts`
- `POST /loadCachedImageArtifacts`
- `POST /loadCachedChartData`
- `POST /loadCachedBrushStrokes`
- `POST /loadDrawAreaLayerItemTransform`
- `POST /updateArtifacts`
- `POST /deleteArtifacts`

Deliverables:

- explicit `internal/artifacts` owner for IDE-mode import/update/delete reads
  and writes
- binary-store-backed durable file artifact persistence
- typed cached-artifact load paths
- attachment-policy enforcement for chat attachments, dropzones, and param
  uploads
- focused tests in service, route, and app layers

Why this is second:

- it reuses the binary payload and path foundations from Slice 1
- it is a separate runtime boundary from plain workspace file browsing
- it closes the active caller surface used by chat attachments and param UIs

Status:

- landed on 2026-03-10

Completed in this slice:

- new explicit `internal/artifacts` owner for state-relative artifact id
  normalization, workspace-file imports, cached image/chart/brush/transform
  reads, active caller-backed writes, and file deletes
- thin `internal/httpapi` transport plus real IDE app wiring
- active write support bounded to `File`, `BrushStroke`, and
  `DrawAreaLayerItemTransform`
- typed unsupported-artifact behavior for `Image` and `ChartData` updates in
  this bounded slice

Focused current-work doc:

- `phase-22-ide-artifact-owner-plan.md`
  - narrows this slice to the bounded IDE owner surface, keeps public artifact
    ids state-relative, and defers share/deployment overlay behavior to
    Slice 3

### Slice 3: Share/deployment artifact session behavior and phase closeout

Routes:

- share/deployment behavior of:
  - `POST /updateArtifacts`
  - `POST /deleteArtifacts`
  - `POST /loadCachedImageArtifacts`
  - `POST /loadCachedChartData`
  - `POST /loadCachedBrushStrokes`
  - `POST /loadDrawAreaLayerItemTransform`

Deliverables:

- explicit per-session artifact overlay ownership for share/deployment flows
- policy-gated in-memory updates and deletes
- deployment-relative artifact id normalization
- websocket broadcast integration for share-session artifact updates where the
  current product surface depends on it
- focused tests for share/deployment semantics

Why this is third:

- it depends on the bounded artifact owner from Slice 2
- it is the only part of the cluster that crosses into deployment/share
  runtime overlays instead of plain IDE file-system and artifact ownership

Status:

- landed on 2026-03-10

Completed in this slice:

- new explicit `internal/shareartifacts` owner for deployment/share-session
  overlay reads, in-memory mutations, and session cleanup
- deployment-mode `internal/httpapi` artifact transport over
  `RequireShareSession(...)`
- share-session-scoped frontend `UpdateArtifacts` websocket broadcasts for
  non-file deployment updates
- focused service, route, realtime-message, app, and cleanup coverage

Decisions recorded in this slice:

- the live draw-area cached-load caller path is
  `POST /loadDrawAreaLayerItemTransform`; the earlier
  `loadCachedDrawAreaLayerItemTransform` wording in planning text was stale
  and is corrected here
- IDE artifact ownership remains separate from deployment/share-session
  overlay ownership
- deployment/share updates and deletes stay in memory for the session overlay;
  deployment disk remains the fallback source of truth for cached loads

## Verification

- `./scripts/go.sh test ./internal/filebrowser ./internal/httpapi ./internal/app -run 'Test(Service|RegisterFileBrowserRoutes|RegisterBinaryRoutes|AppServesFileBrowserRoutes)' -count=1`
- `./scripts/go.sh test ./internal/shareartifacts ./internal/httpapi ./internal/realtime ./internal/app -run 'Test(NewUpdateArtifactsMessage|Service(UpdateAndLoadUsePerSessionOverlayAndLeaveDiskUntouched|DeleteIsInMemoryOnlyAndNormalizesIDs|DeleteShareSessionDropsOverlayState|UpdateRejectsPolicyDenied)|RegisterArtifactRoutes(ShareModeUpdatesAndLoadsOverlay|ShareModeRejectsPolicyDenied|RoundTripAndUnsupportedUpdate|BlocksLauncherMode)|AppShareModeServesArtifactOverlayRoutesAndBroadcastsScopedUpdates|CleanupExpiredDeploymentSessionsDropsTerminalAndRealtimeState)' -count=1`

## Next Recommended Step

Phase 22 is closed for the current caller-backed artifact/file-browser
cluster. The next recommended step is a broader rerank outside this cluster
instead of reopening artifact/file-browser transport work.
