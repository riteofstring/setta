## 2026-03-09 15:45:22 PDT

Implemented the branch-blocking review fixes rather than layering more local-state patches on top.

Frontend state and rendering:
- Per-window `chatId` is now authoritative for project chat windows. Workspace windows and standalone window-space windows pass `chatId` through `UnifiedChatSurface` into `ProjectChat`, and new-thread creation writes back to the owning window instead of only updating the global active chat.
- Removed the browser-local shadow persistence for `projectChatWindowing`. Backend snapshots are authoritative again, with optimistic frontend ops replayed only while still pending.
- Fixed window-space restore semantics so saved floating windows replace existing floating workspace windows in place, while collisions with live non-floating windows get remapped to fresh ids.
- Removed stale slug caches in `windowSpacePaths` and `sectionSlugPaths`; route resolution now reflects live project state without requiring reload.
- Added a save-flow sync step for window spaces so the current workspace layout is persisted before a window-space snapshot is created. This was required after removing the local shadow because the backend model had been dropping project chat windowing during merge.

Backend/state-model fixes:
- Added shared chat continuity validation in `backend/setta/agentic/chat_continuity.py` and reused it from both linked-chat invocation and standard AI-run startup, preventing mixed engine/project histories on reused `chatId`s.
- Changed MCP retry behavior to be metadata-driven. `invoke_linked_chat` stays scope-compatible as a read tool but explicitly opts out of retry-on-disconnect, preventing duplicate side effects after reconnects.
- Fixed the backend project-state persistence model so `projectChatWindowing` survives `merge_single_config_into_backend()` / `convert_backend_to_single_config()` round trips by storing it per project config in backend state. Before this, backend-authoritative loading looked correct in some code paths but windowing writes were silently discarded on merge.

Verification:
- Frontend Vitest coverage added/updated for per-window chat identity, standalone window-space hydration, backend-authoritative project-windowing sync, restore-collision behavior, save-flow ordering, and slug invalidation.
- Backend pytest coverage added for project-chat-windowing backend round-trips, MCP retry metadata, linked-chat disconnect retry behavior, and managed/external chat continuity conflicts.
- Playwright coverage added for distinct project chat threads per saved window-space window and verified the full standalone window-space spec passes.
- CDP visual verification completed against workspace floating chat windows and standalone window-space rendering at desktop and smaller viewport sizes; no clipping or overlap regressions observed in the checked flows.

## 2026-03-09 16:54:17 PDT

Implemented the remaining review-driven fixes for backend-authoritative windowing sync, share-policy enforcement, standalone window-space hydration, and the touched DX regressions.

Backend/state behavior:
- `processProjectStateUpdateFromBackend()` now includes `projectChatWindowing` in the comparable project-state payload, so backend-only windowing changes are no longer ignored during reconciliation.
- Repaired the broken frontend regression fixture for project-windowing sync so the test exercises the real single-config/project-config factories instead of invalid partial state.
- Window-space mutation routes now go through a shared layout-policy helper. In share mode this honors `allowLayoutChanges`; outside share mode the existing deployment-mode deny behavior stays intact.
- Added backend tests covering both denied and allowed window-space route behavior under share policy.

Frontend/runtime behavior:
- Standalone window-space tabs now keep local per-window `chatId` and user-resized bounds when the saved layout is rehydrated due to viewport or title changes. Only derived presentation fields are refreshed from the persisted snapshot.
- Kept the saved-window-space browser coverage on the stable path: distinct project chat threads remain preserved per window in both workspace and standalone views.
- Removed a runtime regression uncovered during E2E verification where `CustomResizable` referenced an undefined `zIndexClass` and prevented project pages from mounting.

DX and type-safety cleanup:
- Removed touched-file fallbacks that fabricated missing `windowSpaces` or `projectChatWindowing` state locally; the changed code now relies on the canonical required project-state shape.
- Narrowed standalone route booleans, window-space lookups, and `ProjectChat` prop wiring so the touched frontend surfaces are type-safe again.
- Replaced the slug-path helper dependency on broader store helpers with narrower local helpers, and fixed the Radix passthrough mock typing in the header test.

Verification:
- `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/utils/windowSpacePaths.test.ts src/utils/sectionSlugPaths.test.ts src/components/AppHeader/FollowAIToggleButton.test.tsx src/state/actions/windowSpaces.test.ts` passed: 7 files, 44 tests.
- `source activate.sh && ./scripts/run_backend_tests.sh tests/routers/test_share_policy_routes.py -q` passed: 20 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g 'saved window spaces preserve distinct project chat threads per window in both workspace and standalone views'` passed.
- CDP verification confirmed the project page and `Window Spaces` pane render correctly in a disposable project on the live dev instance.

Residual baseline:
- The branch still has broader pre-existing TypeScript errors in `frontend/src/state/actions/sectionInfos.ts` and `frontend/src/components/Utils/Resizable/CustomResizable.tsx`. The fixes here were kept local and verified by tests, but this turn did not attempt a full-file type cleanup of those baseline-red modules.
