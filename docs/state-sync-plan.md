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
- Migrated active section selection and viewport synchronization to the helper so both flows share pending op IDs and no longer rely on bespoke debounced route calls.
- Extended optimistic helper usage across additional section header controls (rename, minimize, lock), param selection/unselect, and variant management flows (select/default/frozen/json-source toggles, naming, deletion) so they participate in pending op reconciliation.
- Hooked high-frequency param editors into the shared pipeline: debounced entered values, param renames, slider/color configuration panels, markdown text, image paths, social URLs, and gen-code prefix/suffix now all emit `frontendOpId`s while replaying the same reducers locally.

## Next Steps
1. Finish migrating outstanding UI toggles and editors—`hideParams`/`hideUnpinnedParams`, type-column visibility, callable changes/LSP resets, and any remaining debounced metadata writers—to use either the shared helper or coordinated local buffering.
2. When all flows participate in the pending-op tracker, regenerate shared types (`source ./activate.sh && pnpm generate`), run formatters/tests (`source ./activate.sh && ./format_code.sh`, targeted `pnpm test` + backend suites), and perform rapid-edit smoke checks against websocket updates.
