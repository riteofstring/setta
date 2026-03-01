# section-impls batch patch transport

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce websocket transport overhead for multi-section UI-only updates by sending
one batched section-impl patch instead of N single-section patch messages.

## Change

Backend:
- Added `ProjectStateSectionImplsPatch` and websocket message
  `PatchFrontendProjectStateSectionImpls`.
- Added backend sender path
  `broadcast_project_state_section_impls_patch(...)`.
- Updated `_merge_and_broadcast_ui_only_section_impl_patches(...)` to batch when
  updated section count is `>= 3` and keep existing per-section behavior for
  smaller updates.

Frontend:
- Added `applySectionImplsProjectStatePatch(...)` with atomic validation/apply
  for all section updates in one state transaction.
- Added websocket receive handler for
  `PatchFrontendProjectStateSectionImpls` with the same revision-guard + resync
  semantics as other patch handlers.

## Measurement method

Scenario:
1. Start `real_project_manager()` with autosave off.
2. Create N top-level dict sections.
3. Run one `set_section_sizes` update touching all N sections.
4. Capture emitted batched patch payload.
5. Serialize:
   - Actual batched message (`WebsocketMsgPatchFrontendProjectStateSectionImpls`)
   - Equivalent legacy payload as N serialized single-section messages
     (`WebsocketMsgPatchFrontendProjectStateSectionImpl`) with the same payload
     content and revision/op-id semantics.

Serialization metric:
- `len(message.model_dump_json().encode("utf-8"))`

## Results (local)

- N = 3 updated sections
  - message count: `3 -> 1` (`66.7%` fewer messages)
  - payload bytes: `1,875 B -> 1,383 B` (`26.24%` smaller)
  - bytes saved per update: `492 B`

- N = 5 updated sections
  - message count: `5 -> 1` (`80.0%` fewer messages)
  - payload bytes: `3,131 B -> 2,155 B` (`31.17%` smaller)
  - bytes saved per update: `976 B`

Notes:
- Savings scale with section count because revision/op metadata and websocket
  envelope fields are no longer repeated for each section.

## Coverage

- `tests/project_state/test_section_impl_batch_patch_transport.py`
- `tests/project_state/test_ui_only_fast_path.py`
- `tests/project_state/test_drag_route_queue_coalescing.py`
- `frontend/src/state/actions/sectionInfos.test.ts`
- `frontend/src/state/actions/websocketReceive.test.ts`
- `frontend/tests/e2e/sections/section-undo-redo.spec.ts`
