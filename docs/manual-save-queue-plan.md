# Manual Save Queue Drain Plan

## Goal
Guarantee that manual save requests (save, save-as-new) persist the latest backend state by waiting for in-flight frontend operations to finish before invoking `perform_manual_save`.

## Current Pain Points
- Routes `route_save_project` and `route_save_as_new_project_config` call `perform_manual_save` immediately, bypassing the `BaseProjectManager` message queue.
- Pending operations live in `BaseProjectManager.pending_frontend_ops`, but there is no API to block until the queue drains.

## Proposed Changes
1. **Queue Drain Helper** *(completed)*
   - Add an async utility on `BaseProjectManager` that awaits the queue drain (likely via `self.message_queue.join()` and checks for completion of tracked operations).
   - Ensure the helper cooperates with the existing `_project_state_lock` to avoid deadlocks.
   - Expose a safe wrapper method, e.g. `await project_manager.finish_pending_operations()`.

2. **Route Payload Cleanup** *(completed)*
   - Stop requiring a full `ProjectStateSingleConfig` payload for manual saves; only the `projectConfigId` (and any save-as metadata) should be necessary once the backend state is authoritative.
   - Update request models and frontend callers accordingly, keeping compatibility shims if staged rollout is needed.

3. **Router Integration**
   - In both manual-save routes, await the new helper before calling `perform_manual_save`. *(completed)*
   - Preserve notification behavior; only proceed to save if the queue drain succeeds.

4. **Manual Save Semantics**
   - Consider moving the queue wait into `perform_manual_save` to centralize logic.
   - Maintain the current autosave cancelation semantics inside `perform_manual_save`.

5. **Save-As Existing Implementation** *(removed)*
   - The overwrite route and supporting UI were deleted because the workflow is risky and can be replicated via "save as new" plus rename/delete.
   - Keep future work in mind should user demand materialize, but no backend surfacing remains today.

6. **Testing & Validation** *(completed)*
   - Added regression tests under `tests/project_state/` that enqueue delayed rename operations, wait for the queue to drain, and assert the persisted state reflects the pending work.
   - Exercised both the main project manager and the settings manager paths using real manager fixtures.

## Open Questions
- Should manual saves broadcast project state snapshots after completing the disk write?
- Are there frontend expectations around immediate notifications that require extra error handling if the queue drain fails?
- Do we need to surface a timeout for queue drain to avoid hanging when a handler stalls?

Addressing these questions will clarify whether additional telemetry or safety nets are required once the base implementation lands.

## Progress
- Added `finish_pending_operations` on `BaseProjectManager` with queue-task health checks and an idle event so callers can await pending work safely.
- Updated the manual save routes (`SAVE_PROJECT`, `SAVE_AS_NEW_PROJECT_CONFIG`) to await the helper before invoking `perform_manual_save`.
- Simplified manual save payloads to pass only `projectConfigId`, regenerating endpoint bindings and ensuring backend managers pull the authoritative state before saving.
- Added real-manager fixtures for both settings and project managers plus queue-drain regression coverage verifying manual saves persist pending operations.

## Next Steps
- Consider removing the now-unused deep-clone helpers in frontend save actions once the save-as implementation lands and no longer depends on them.
- Evaluate whether manual save notifications should include the drained frontend op IDs or broadcast updated project snapshots post-save.
