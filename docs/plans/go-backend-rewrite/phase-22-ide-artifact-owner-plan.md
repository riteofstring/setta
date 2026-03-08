# Phase 22 IDE Artifact Owner Plan

## Purpose

This doc narrows Phase 22 Slice 2 into the concrete IDE-only artifact owner
work that is caller-backed today.

The parent phase doc already selected artifact ownership as the remaining
direct frontend gap after the landed file-browser slice. This focused doc
records the bounded implementation shape so the Go rewrite does not drift back
toward the Python `Artifacts` manager graph or pull share-session overlay
behavior into the IDE owner.

## Status

Landed on 2026-03-10.

Completed in this slice:

- new explicit `internal/artifacts` owner for IDE artifact import, cached
  reads, active caller-backed writes, and file deletes
- thin `internal/httpapi` transport for:
  - `POST /importFilesToArtifacts`
  - `POST /loadCachedImageArtifacts`
  - `POST /loadCachedChartData`
  - `POST /loadCachedBrushStrokes`
  - `POST /loadDrawAreaLayerItemTransform`
  - `POST /updateArtifacts`
  - `POST /deleteArtifacts`
- real IDE app wiring and focused service/route/app coverage

Still deferred after this slice:

- share/deployment artifact overlay behavior in Phase 22 Slice 3

## Inputs

- `docs/plans/go-backend-rewrite/phase-22-artifact-and-file-browser-route-cluster-plan.md`
- `backend/setta/routers/artifact.py`
- `backend/setta/project_state/artifacts.py`
- `backend/setta/utils/attachment_policy.py`
- `tests/routers/test_file_browser_routes.py`
- `tests/routers/test_share_artifacts.py`
- `frontend/src/components/Chat/useChatAttachmentManager.ts`
- `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`
- `frontend/src/state/hooks/artifacts.ts`
- `frontend/src/state/actions/artifacts.ts`
- `internal/binary/store.go`
- `internal/chatattachments/service.go`
- `internal/filebrowser/service.go`

## Caller-Backed Surface

Routes in scope for this slice:

- `POST /importFilesToArtifacts`
- `POST /loadCachedImageArtifacts`
- `POST /loadCachedChartData`
- `POST /loadCachedBrushStrokes`
- `POST /loadDrawAreaLayerItemTransform`
- `POST /updateArtifacts`
- `POST /deleteArtifacts`

Concrete active caller needs today:

- chat attachments and stateful dropzones need file artifact writes and deletes
- draw-area sync needs brush-stroke and transform writes plus conflict results
- image, chart, brush-stroke, and transform section/runtime hooks need cached
  reads from disk-backed artifact ids

Current caller-backed write surface does not require image or chart mutation.
Those can stay out of this slice unless implementation work proves a direct
dependency.

## Clean-Break Decisions

1. IDE only in this slice.
   - share/deployment overlay behavior stays deferred to Slice 3
   - Go routes for this slice should require the full IDE runtime
2. Public artifact ids in Go should be state-relative.
   - normalize both absolute and relative inputs to `artifacts/...`
   - resolve on-disk paths from `setta_files` plus the relative id
3. Disk files are the durable artifact source of truth.
   - the binary store remains transport/storage support for payload bytes and
     image preview refs
   - do not recreate a broad in-memory artifact graph as the primary store
4. Keep update support bounded to active write types.
   - implement `File`, `BrushStroke`, and
     `DrawAreaLayerItemTransform` updates now
   - reject `Image` and `ChartData` updates with a typed unsupported-artifact
     error until a concrete caller exists

## Desired Go Boundary

Add a new `internal/artifacts` owner with bounded operations:

- import files from workspace paths into durable artifact files
- load cached image/chart/brush/transform artifacts from disk
- apply artifact updates for the active write surface
- delete file artifacts rooted under the artifact root
- enforce upload policy for file artifacts by explicit upload scope

The owner should not:

- depend on route files for normalization or policy logic
- manage deployment/share-session overlays
- replicate the Python manager's broad cross-project watcher graph

## Service Shape

Recommended service operations:

- `ImportFiles(ctx, request)`
- `LoadCachedImages(ctx, paths)`
- `LoadCachedChartData(ctx, paths)`
- `LoadCachedBrushStrokes(ctx, paths)`
- `LoadCachedDrawAreaLayerItemTransforms(ctx, paths)`
- `Update(ctx, request)`
- `Delete(ctx, request)`

Recommended dependencies:

- `SettaFilesRoot`
- `ArtifactsRoot`
- `BinaryStore`

Recommended internal responsibilities:

- state-relative artifact id normalization and safe path resolution
- deterministic artifact serialization/parsing
- per-path metadata cache with last-known hashes for conflict detection
- optional cached binary refs for image/file artifacts created during this
  runtime

## Persistence Rules

### File imports

- validate each workspace path through the bounded file/path rules
- reject missing paths and directories explicitly
- apply upload policy before writing
- choose a new artifact id under `artifacts/` using the source extension
- copy file bytes into the artifact root
- store a durable binary payload for the imported file so the runtime has a
  typed ref when needed during this process lifetime

### Cached reads

- image loads read bytes from disk, materialize a durable binary ref, and
  return `ImageArtifact`
- chart loads parse CSV into `ChartDataArtifact`
- brush-stroke and transform loads parse JSON into typed artifacts
- missing or unreadable paths should return `null` entries instead of failing
  the whole batch when the request path itself is otherwise valid

### Updates

- `File` updates read bytes from the binary store and write them to disk
- `BrushStroke` and `DrawAreaLayerItemTransform` updates serialize to JSON
- conflict handling should follow the bounded Python product semantics using a
  last-known hash cache:
  - same payload as last known state -> `unchanged`
  - external disk change + `skip` -> `skipped`
  - external disk change + `backup` -> backup current disk file, then write and
    return `conflict`
  - external disk change + `overwrite` -> write and return `conflict`
- image/chart updates are out of scope for this slice and should return a
  typed unsupported-artifact error

### Deletes

- only `File` deletes are in scope
- artifact ids must stay under the artifact root
- delete the on-disk file and any cached binary payload tracked by the owner
- reject non-file delete requests explicitly

## Upload Policy Boundary

Add a small Go policy helper inside `internal/artifacts`:

- `chat` scope maps to the chat attachment limits
- `generic` scope maps to stateful dropzone limits

For this slice, mirror the current product values:

- chat max file bytes: `25 MiB`
- stateful dropzone max file bytes: `25 MiB`
- chat and generic allowed MIME prefixes default to unrestricted unless
  configured later by a separate settings/runtime slice

The Go owner should return typed errors for:

- file too large
- attachment type not allowed
- invalid upload scope

Do not add heuristic MIME fallbacks beyond standard mime-type detection and the
explicit request ref metadata already available.

## Transport Boundary

Add thin `internal/httpapi` artifact routes that only own:

- JSON decoding
- IDE-mode guard via `RequireFullIDERuntime`
- typed error mapping
- delegation to `internal/artifacts`

Do not put artifact path resolution, conflict handling, or upload-policy logic
in the route layer.

## Decisions Confirmed In Code

- public Go artifact ids are now state-relative `artifacts/...` ids even when
  callers provide absolute artifact paths
- disk files under the artifact root are the durable source of truth
- image cached loads materialize durable binary refs through
  `internal/binary.Store`
- current caller-backed writes are bounded to `File`, `BrushStroke`, and
  `DrawAreaLayerItemTransform`
- `Image` and `ChartData` updates now return a typed unsupported-artifact error
  instead of silently broadening the slice

## Verification

- `./scripts/go.sh test ./internal/artifacts ./internal/httpapi ./internal/app -run 'Test(Service|RegisterArtifactRoutes|AppServesArtifactRoutes)' -count=1`

## Next Recommended Step

The remaining share/deployment overlay follow-on is now landed in
`phase-22-share-artifact-session-overlay-plan.md`. Keep this bounded IDE owner
intact; do not reopen a broad mixed artifact manager.
