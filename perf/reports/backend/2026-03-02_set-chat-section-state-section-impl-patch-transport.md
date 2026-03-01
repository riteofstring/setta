# set_chat_section_state section-impl patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 1dfed87f (baseline emulation) -> working tree

## Goal

Reduce project-state transport payload for `set_chat_section_state` while
preserving full codegen refresh semantics (chat state contributes to dependency
graph outputs).

## Change

Backend changes:
- Added `_update_and_broadcast_section_impl_patch_no_name_validation(...)`.
  - Runs the same `update(...)` path (`validate_name_rules=False`) as prior
    behavior.
  - Emits a revisioned section-impl patch when possible.
  - Falls back to full snapshot if revision did not advance.
- Updated `set_chat_section_state` to use the new helper.

This keeps update/codegen work intact and only changes websocket transport shape.

## Benchmark scenario

Representative route benchmark: `set_chat_section_state`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Add one top-level Chat section.
4. Benchmark 40 measured iterations (5 warmup).
5. Measure end-to-end route latency (`set_chat_section_state` +
   `finish_pending_operations`).
6. Capture websocket payload bytes by intercepting `_broadcast_frontend(...)` and
   measuring serialized message bytes (`message.model_dump_json()`).
7. Count only project-state transport messages:
   - `WebsocketMsgUpdateFrontendProjectState`
   - `WebsocketMsgPatchFrontendProjectStateSectionImpl`
8. Set a unique `inputText` each iteration to force mutating updates.

Baseline emulation:
- Monkeypatch `_update_and_broadcast_section_impl_patch_no_name_validation(...)`
  to call `_update_and_broadcast_project_state_no_name_validation(...)`
  (snapshot transport).

After:
- Native helper behavior with section-impl patch transport.

## Results (local)

`set_chat_section_state` on 1000-param synthetic state:

- Message type:
  - baseline: `WebsocketMsgUpdateFrontendProjectState`
  - after: `WebsocketMsgPatchFrontendProjectStateSectionImpl`

- Websocket payload bytes:
  - baseline median: `761,040.0`
  - after median: `642.0`
  - reduction: `99.92%` (`~1185.42x` smaller)

- Route latency:
  - baseline median: `181.5381 ms`
  - after median: `178.2706 ms`
  - median improvement: `~1.80%`

- Tail latency:
  - baseline p95: `295.5991 ms`
  - after p95: `280.4600 ms`
  - p95 improvement: `~5.12%`

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.
- Local latency gains are modest because this route still executes full
  update/codegen refresh by design; the major win is transport size.

## Coverage

Backend:
- `tests/project_state/test_ui_only_fast_path.py`
  - `test_chat_section_state_still_triggers_full_refresh`
    - still requires codegen refresh
    - now asserts section-impl patch transport (no snapshot)
