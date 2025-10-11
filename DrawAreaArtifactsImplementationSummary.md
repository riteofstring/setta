# Draw Area Artifact Refresh Implementation – Summary

## Frontend
- **State architecture**
  - Introduced `remoteRevision` counters to all draw-area artifact stores (`useImages`, `useBrushStrokes`, `useDrawAreaLayerItemTransform`, etc.) so canvas renders can react to backend updates without re-subscribing to full payloads.
  - Split the legacy `useLoadedDrawAreaData` hook into:
    - `useDrawAreaArtifactLoader`, which reads element IDs from `useProjectState`, fetches any missing artifacts from the backend caches, and triggers decoding only when needed.
    - `useDrawAreaArtifactData`, which returns the current in-memory artifacts for components that genuinely need them.
- **Rendering changes**
  - `DrawArea` now owns only the revision numbers; it redraws layers when the revisions change instead of subscribing to entire artifact maps.
  - Canvas utilities enqueue brush strokes and transform updates in a new debounced save queue. Pointer-up on drawing/erasing triggers save scheduling; transform edits flush immediately.
- **Autosave queue**
  - `state/actions/artifacts.ts` now batches outgoing artifact updates, skips redundant writes via deep equality, and calls the new `/updateArtifacts` backend endpoint.
  - Conflict or skip responses surface to users through warning notifications.
  - Project save actions flush any pending autosave work before calling the existing project save APIs.
- **Miscellaneous**
  - Image cache subscriptions now re-decode base64 payloads only when they actually change, preventing stale decoded canvases.

## Backend
- `Artifacts` manager now:
  - Tracks conflict metadata (dirty flag, last hash, backup path).
  - Prepares writes via a shared helper that hashes payloads, short-circuits when nothing changed, and handles backup logic.
  - Exposes `apply_updates`, used by the new API, to persist incoming artifacts immediately; conflict cases raise warning notifications with backup info.
  - Enhances the file watcher callback to back up unsaved local edits before overwriting cache entries, then emits conflict notifications when that happens.
- Added `/updateArtifacts` route, reusing `SaveConflictStrategy` so the frontend can request backup/overwrite/skip behavior explicitly.
- Extended generated route enum with `UPDATE_ARTIFACTS`.

## Integration Notes
- Frontend autosave queue defaults to the backend’s backup strategy but can be adjusted by passing a `conflictStrategy` with the new endpoint.
- Conflict notifications now originate from both websocket saves (autosave) and file watcher events; UI should surface metadata from notifications to help users resolve issues.
