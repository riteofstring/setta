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
