# Section-impl patch deferred refresh rollout

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Extend deferred codegen refresh from the TaskBoard pilot to the broader shared
section-impl patch write path so ACK latency drops across many routes that
currently block on synchronous `_refresh_codegen_state(...)`.

## Change

Converted the following routes from synchronous section-impl patch updates to
`_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh(...)`:

- `set_type_error_ignore`
- `set_code_section_diagnostics_mute`
- `set_code_section_diagnostic_code_suppression`
- `set_code_file_binding`
- `set_parent_default_child_section_type`
- `set_list_root_view_mode`
- `set_task_board_section_state` (already converted in pilot; retained)
- `set_spreadsheet_file_path`
- `set_spreadsheet_section_settings`
- `set_chat_section_settings`
- `get_chat_section_chat_id` (stale chat-id clear path)
- `set_chat_section_chat_id`
- `set_image_area_image_path`
- `set_chart_area_data_path`
- `set_chart_type`
- `set_chart_settings`

Left synchronous on purpose:

- `set_chat_section_state`
  - Existing tests assert this path still requires immediate refresh because chat
    state contributes to dependency/codegen output.

## Verification

- `tests/project_state/test_patch_transport_additional_routes.py`
  - Updated to assert the converted routes:
    - still ACK via section-impl patch transport,
    - do not trigger immediate `_refresh_codegen_state`,
    - schedule deferred refresh.
- `tests/project_state/test_task_board_deferred_refresh.py`
  - Existing deferred-refresh ACK and run-flush behavior still pass.
- `tests/project_state/test_ui_only_fast_path.py`
  - Existing contract that `set_chat_section_state` remains synchronous still
    passes.

## Benchmark scenario

Representative converted route benchmark: `set_chart_settings`

Method:

1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Add one top-level Chart section.
4. Benchmark 40 measured iterations (5 warmup).
5. Measure ACK latency as route call + `finish_pending_operations(...)`.
6. Vary `xAxisLog` each iteration to force actual mutation.

Baseline emulation:

- Monkeypatch
  `_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh(...)`
  to call
  `_update_and_broadcast_section_impl_patch_no_name_validation(...)`
  (old synchronous behavior).

After:

- Native deferred-refresh behavior.

## Results (local)

`set_chart_settings` on 1000-param synthetic state:

- ACK payload type:
  - baseline: `WebsocketMsgPatchFrontendProjectStateSectionImpl`
  - after: `WebsocketMsgPatchFrontendProjectStateSectionImpl`

- ACK payload size:
  - baseline median: `637.0 B`
  - after median: `641.0 B`
  - effectively unchanged

- ACK latency (user-visible route completion):
  - baseline median: `172.1381 ms`
  - after median: `101.0538 ms`
  - median improvement: `~41.29%`
  - baseline p95: `272.8162 ms`
  - after p95: `192.6987 ms`
  - p95 improvement: `~29.37%`

## Notes

- Prior TaskBoard pilot already measured similar ACK gains
  (`perf/reports/backend/2026-03-03_task-board-deferred-refresh-ack-pilot.md`).
- This rollout applies the same two-stage ACK pattern across a shared path used
  by many section-scoped write routes.
