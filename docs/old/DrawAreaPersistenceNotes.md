# Draw Area Persistence Notes

## Status Update

- ✅ Structural layer inserts now route through the backend queue via `/appendDrawAreaLayerItem`; painted strokes persist after reload.
- 🔄 Next focus: reconcile optimistic local state when the backend pushes the authoritative project snapshot.

## Current Bug
- Previously: Saving a project after painting a stroke in a draw area drops the stroke layer when the project reloads.  
- Root cause analysis retained below for reference while we monitor the fix.

## Root Cause

- Draw-area layer elements (the “brush stroke” entries in `DrawSectionImpl.layers`) are added directly to the frontend Zustand stores.  
- The backend never receives that structural change, so its canonical project state lacks the new layer. When `/saveProject` runs, it rewrites `project.json` without the stroke reference. `/updateArtifacts` correctly persists the raw brush stroke file, but the layer metadata pointing at it is missing.

## Architectural Goals and Tension

- The backend is meant to be the source of truth and to process all mutations (including future AI-driven edits) through `ProjectManager` helpers (`helpers_lvl1/2/3`).  
- Frontend optimistically mutating state avoids round-trip latency but risks divergence from the backend queue.
- The save route currently drops any frontend payloads to avoid overwriting with stale data, assuming all real updates already flowed through backend.

## Suggested Direction

1. **Move structural draw-area updates through the backend queue.** ✅  
   - Implemented via `/appendDrawAreaLayerItem`, which the frontend now calls when a stroke is finalized so the backend records the new layer before any save runs.  
   - Continue to push brush stroke artifacts through `/updateArtifacts` for low-latency binary data sync.

2. **Use optimistic UI with reconciliation.**  
   - Frontend can update local stores immediately for responsiveness, but must reconcile when the backend broadcasts the authoritative project snapshot.

3. **Keep `/saveProject` backend-driven.**  
   - Once every structural change hits the backend queue, the save endpoint can remain backend-driven without accepting entire frontend snapshots.  
   - If any future flows require speculative local edits, introduce revision checks/conflict resolution before saving to disk.

This approach preserves the backend as the single source of truth, keeps the pathway open for AI-issued edits, and resolves the draw-area persistence regression.
