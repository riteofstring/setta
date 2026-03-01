# Task-board deferred refresh ACK pilot

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ 823a0237 (baseline emulation) -> working tree

## Goal

Test deferred codegen refresh on a high-frequency task-board write route so the
write ACK path is no longer blocked on synchronous `_refresh_codegen_state(...)`.

## Change

Backend changes:
- Added deferred codegen refresh scheduling (debounced, queue-serialized) per
  project config.
- Added `_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh(...)`
  to:
  - validate + merge canonical state
  - broadcast section-impl patch ACK immediately
  - schedule deferred full refresh broadcast.
- Switched `set_task_board_section_state` to this deferred-refresh helper.
- Added run-path safety:
  - `create_run_command(...)` now flushes pending deferred codegen refreshes
    before constructing run command payloads.
- Added cancellation behavior:
  - Any synchronous `update(...)` clears pending deferred refresh for the same
    project config to avoid redundant duplicate refresh work.

## Benchmark scenario

Representative route benchmark: `set_task_board_section_state`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Add one top-level TaskBoard section.
4. Benchmark 40 measured iterations (5 warmup).
5. Measure ACK latency as:
   - route call + `finish_pending_operations(...)`.
6. Measure eventual consistency latency (after behavior only) as:
   - route call + explicit `_flush_pending_deferred_codegen_refresh(...)`.
7. Capture websocket payload bytes via `_broadcast_frontend(...)` for:
   - `WebsocketMsgPatchFrontendProjectStateSectionImpl`
   - `WebsocketMsgUpdateFrontendProjectState`
8. Vary task title per iteration to force real state mutations.

Baseline emulation:
- Monkeypatch
  `_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh(...)`
  to call
  `_update_and_broadcast_section_impl_patch_no_name_validation(...)`
  (old synchronous refresh behavior).

After:
- Native deferred-refresh behavior.

## Results (local)

`set_task_board_section_state` on 1000-param synthetic state:

- ACK payload type:
  - baseline: `WebsocketMsgPatchFrontendProjectStateSectionImpl`
  - after: `WebsocketMsgPatchFrontendProjectStateSectionImpl`

- ACK payload size:
  - baseline median: `645.0 B`
  - after median: `647.0 B`
  - effectively unchanged

- ACK latency (user-visible route completion):
  - baseline median: `168.3755 ms`
  - after median: `101.6302 ms`
  - median improvement: `~39.64%`
  - baseline p95: `268.1438 ms`
  - after p95: `200.3858 ms`
  - p95 improvement: `~25.27%`

- Eventual consistency latency (ACK + forced deferred refresh flush):
  - baseline median: `168.3755 ms`
  - after median: `248.6975 ms`
  - higher because refresh work is intentionally deferred plus debounce wait.
  - stage-B transport type after ACK: `WebsocketMsgUpdateFrontendProjectState`

## Coverage

Backend:
- `tests/project_state/test_task_board_deferred_refresh.py`
  - `test_set_task_board_section_state_acks_via_patch_then_defers_refresh`
  - `test_create_run_command_flushes_pending_task_board_deferred_refresh`
- Existing patch-transport tests still pass:
  - `tests/project_state/test_patch_transport_additional_routes.py`
  - `tests/project_state/test_ui_only_fast_path.py`
