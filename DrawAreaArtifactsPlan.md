# Draw Area Artifacts Plan

## Goals
- Avoid unnecessary rerenders in the draw area while keeping backend-driven updates visible.
- Provide a conflict strategy when disk changes and user edits happen concurrently.
- Decide what granularity to use when syncing artifact changes back to the backend.

## Render Behaviour
1. Split the current `useLoadedDrawAreaData` into:
   - a loader hook that only derives layer element ids from `useProjectState` and triggers cache fetches using `getState()` reads in `useEffect` (no subscriptions to artifact stores), and
   - an optional data hook for components that truly need the artifact payloads.
2. Record a `remoteRevision` (timestamp or counter) inside each artifact store (`useBrushStrokes`, `useDrawAreaLayerItemTransform`, etc.). Increment it only inside websocket-driven updates (`updateArtifacts`).
3. Update `DrawArea` to subscribe solely to the revision value and trigger `drawAllLayers` whenever it changes. Local canvas mutations continue to read/write via `getState()` so they do not cause rerenders but still refresh the canvases.
4. Deduplicate websocket payloads by comparing hashes or deep equality before mutating the store; skip revision bumps when the payload matches the current snapshot to prevent render loops.

## Conflict Handling
- Extend backend metadata (`Artifacts.update_artifact`) to notice when a watcher event touches an artifact marked `is_dirty`; record the conflict and surface a notification to the user.
- When saving and the on-disk hash differs from `last_read_hash`, default to the existing `backup` strategy so users can recover their work, and return the backup path so the UI can display a diff or warning.
- Longer term, expose conflict resolution options (skip/backup/overwrite) via the UI when an artifact cannot be saved cleanly.

## Sync Frequency
- Flush brush/eraser strokes to the backend on pointer-up events; batch rapid edits with a debounced timer (~1–2s) that also acts as a safety autosave when the user pauses.
- Push transform updates immediately—they are small objects and keep the editor responsive.
- Before writing, compare serialized data hashes against `last_read_hash` to avoid redundant disk writes and needless watcher churn.
- Offer an explicit save control for very large artifacts (e.g., imported high-res images) so users can choose when to incur the cost, while still keeping the debounced autosave for ordinary painting.

### Follow-up Tasks
- Refactor the hooks and stores per above.
- Wire the revision-based redraw in `DrawArea` and adjust websocket handlers.
- Implement conflict notifications and expose the save strategy choices in the UI.
- Build the debounced save queue and ensure backend deduplication based on hashes.
