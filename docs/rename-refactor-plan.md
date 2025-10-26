# Rename Refactor Flow Recovery Plan

## Background
- The backend relies on `DependencyGraph.rename_references` to detect renames and produce replacement suggestions (see `backend/setta/project_state/base_project_manager.py:878` and `backend/setta/code_gen/dependency_graph.py:322`).
- The previous round-trip depended on websocket `messageId`s that never exist for REST requests, so rename prompts silently dropped when a user renamed a section via the UI.
- Frontend helpers such as `makeReplacements` predate the current project-state schema and apply local mutations that the backend never sees.

## Observed Gaps
- Rename refactors are never surfaced because the backend will not emit results unless a `messageId` is present; REST calls (e.g., `route_set_section_name`) do not provide one.
- When rename mode is `ALWAYS_RENAME`, the frontend mutates stale store fields instead of delegating to the backend, causing divergence.
- The existing modal plumbing is only partially wired and cannot render rename confirmations even if a payload arrived.

## Proposed Direction

### Backend
- ✅ Use the per-request `frontendOpId` (tracked via `ProjectManagerRequestWithFrontendOp` and `_current_frontend_op_id`) as the correlation key for rename payloads; store pending results in manager state.
- ✅ After `DependencyGraph.rename_references` runs, emit a structured list of changes that includes section/param identifiers plus both old and new names.
- ✅ When mode is `ALWAYS_ASK`, broadcast a websocket message (reuse or replace `WebsocketMsgReturnRenameRefactorResults`) that carries `{ projectConfigId, frontendOpId, renameMode, renamedNodes[], changedNodeValues[] }`. Treat it as a broadcast so transport (REST vs websocket) no longer matters.
- ✅ When mode is `ALWAYS_RENAME`, apply the replacements directly to the in-flight `ProjectStateSingleConfig` before `update_and_broadcast_project_state` runs, using the same helpers the UI endpoints call (`set_param_entered_value`, `get_curr_section_callable_code_obj`, etc.).
- ✅ Track pending rename prompts server-side (keyed by `frontendOpId`) and expose an accept endpoint that applies queued renames and clears the pending entry.
- ✅ Add a companion decline endpoint so the frontend can dismiss prompts and clear pending state without applying changes.

### Frontend
- Extend the websocket handler layer to capture the rename broadcast, store it in a dedicated rename state keyed by `frontendOpId`, and launch `RenameReferencesModal` once the associated op completes.
- ✅ Replace `processRenameRefactorResults` with a centralized handler that accepts the broadcast payload, filters by active project, persists prompts, and lets later stages decide how to respond.
- ✅ Remove the legacy `makeReplacements` local mutations in favor of backend-powered accept/decline flows; modal buttons now call the new endpoints directly.
- Queue multiple pending rename prompts so the modal can walk through each `frontendOpId` sequentially instead of discarding extras when the backend completes several ops at once.
- Update the modal UI to display both old/new identifiers and affected locations so users understand the impact before confirming.

## Follow-Up
- ✅ Add backend unit coverage that exercises `DependencyGraph.rename_references` and verifies the emitted payload.
- ✅ Add backend regression coverage for the ALWAYS_RENAME auto-apply path.
- Add a Vitest store/modal test that simulates the rename broadcast across each rename mode and ensures the modal launches or auto-applies correctly.
- Audit console logging added during debugging (e.g., websocket receivers) and remove or guard it before shipping.
