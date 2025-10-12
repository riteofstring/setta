# State Sync Improvements Plan

## Conversation Summary
- Confirmed high-level strategy: backend remains source of truth, frontend holds optimistic state via pending operations and local pending values for high-frequency UI.
- Identified need to surface backend metadata (`completed_op_ids_since_last_broadcast`, queued op IDs) so the UI can reconcile rather than overwrite responsive edits.
- Reviewed current backend/ frontend code paths to locate existing placeholders (`completed_op_ids_since_last_broadcast`, `usePendingOperations`, `useLocalPendingValue`).
- Outlined approach to minimize duplication by defining shared operation semantics and replaying them consistently on both sides.

## Implementation Plan
1. **Backend Enhancements**
   - Thread optional `frontendOpId` through `BaseProjectManager` queue handling, keeping sets for pending and recently completed frontend operations.
   - Extend websocket payloads (`ProjectStateSingleConfigWithCompletedOpIds`, `get_latest_project_state`) to include pending op IDs alongside completed IDs.
   - Ensure project manager requests that originate from the UI can carry a `frontendOpId` and mark completion when handlers finish.

2. **Frontend Reconciliation**
   - Expand `usePendingOperations` to store reducers keyed by `opId`, plus a helper to register optimistic updates and invoke backend routes with the same ID.
   - Update `processProjectStateUpdateFromBackend` to drop completed ops, keep only backend-confirmed pending ops, and replay them before committing snapshots.
   - Audit optimistic UI paths (resizing, param edits, active IDs, viewport, etc.) to route through the new helper and avoid duplicate reducer logic; keep `useLocalPendingValue` for component-local buffering.

3. **Tooling & Verification**
   - Regenerate generated TypeScript types after backend schema changes (`pnpm generate`).
   - Run formatters/tests as needed (`./format_code.sh`, `pnpm test`), then manually verify rapid edits stay stable while backend broadcasts arrive.

## Progress
- Built backend tracking for queued/completed frontend ops and broadcast the metadata (`frontendOpId` threaded through `BaseProjectManager`, websocket payload now returns `completedOpIds` and `pendingOpIds`, `get_latest_project_state` exposes current pending IDs).
- Regenerated shared types so the frontend understands the richer payloads and request schemas expose `frontendOpId`.
- Updated frontend stores: pending ops now keep acknowledgement state, reconciliation only replays operations the backend still considers pending, and section resizing uses the new optimistic helper for consistent UX.
- Introduced `dispatchOptimisticProjectStateUpdate` to centralize optimistic updates and ensure backend calls share the same operation IDs.

## Next Steps
1. Migrate remaining optimistic UI flows (active IDs, viewport tweaks, metadata updates, etc.) to the new helper so every operation participates in reconciliation.
2. Adjust `frontend/generation/utils.py` (or run generators under Python ≥3.12) to remove the backslash-in-f-string incompatibility; this unblocks `pnpm generate` / `./format_code.sh` from failing on the generator script.
3. Once generators are fixed, rerun `pnpm generate`, `./format_code.sh`, and any relevant tests (`pnpm test`, targeted backend tests) to validate end-to-end.
