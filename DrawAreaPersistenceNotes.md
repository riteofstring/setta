# Draw Area Persistence Notes

## Current Bug

- Saving a project after painting a stroke in a draw area drops the stroke layer when the project reloads.  
- Backend endpoint `backend/setta/routers/projects.py:97` ignores the `ProjectStateSingleConfig` payload from the frontend and calls `ProjectManager.save()` on its existing state, so any layer metadata created only on the frontend never reaches disk.

## Root Cause

- Draw-area layer elements (the “brush stroke” entries in `DrawSectionImpl.layers`) are added directly to the frontend Zustand stores.  
- The backend never receives that structural change, so its canonical project state lacks the new layer. When `/saveProject` runs, it rewrites `project.json` without the stroke reference. `/updateArtifacts` correctly persists the raw brush stroke file, but the layer metadata pointing at it is missing.

## Architectural Goals and Tension

- The backend is meant to be the source of truth and to process all mutations (including future AI-driven edits) through `ProjectManager` helpers (`helpers_lvl1/2/3`).  
- Frontend optimistically mutating state avoids round-trip latency but risks divergence from the backend queue.
- The save route currently drops any frontend payloads to avoid overwriting with stale data, assuming all real updates already flowed through backend.

## Suggested Direction

1. **Move structural draw-area updates through the backend queue.**  
   - On pointer-up (or equivalent “finalize stroke” moment), enqueue a backend command that appends the layer element via existing helper utilities.  
   - Continue to push brush stroke artifacts through `/updateArtifacts` for low-latency binary data sync.

2. **Use optimistic UI with reconciliation.**  
   - Frontend can update local stores immediately for responsiveness, but must reconcile when the backend broadcasts the authoritative project snapshot.

3. **Keep `/saveProject` backend-driven.**  
   - Once every structural change hits the backend queue, the save endpoint can remain backend-driven without accepting entire frontend snapshots.  
   - If any future flows require speculative local edits, introduce revision checks/conflict resolution before saving to disk.

This approach preserves the backend as the single source of truth, keeps the pathway open for AI-issued edits, and resolves the draw-area persistence regression.
