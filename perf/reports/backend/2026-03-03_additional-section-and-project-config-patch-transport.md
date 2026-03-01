# Additional section/project-config patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ 888681df (baseline emulation) -> working tree

## Goal

Finish the remaining straightforward patch-transport conversions for:
- section-scoped writes that still used full project-state snapshots
- `showParamDisplayNames` project-config writes that still used full snapshots

## Change

Backend changes:
- Added `_update_and_broadcast_project_config_patch_no_name_validation(...)`.
  - Runs the same `update(...)` path (`validate_name_rules=False`) as before.
  - Emits a revisioned project-config patch with full-snapshot fallback.
- Switched the following routes from full snapshot transport to section-impl patch transport while keeping the same update/codegen path:
  - `set_type_error_ignore`
  - `set_code_section_diagnostics_mute`
  - `set_code_section_diagnostic_code_suppression`
  - `set_code_file_binding`
  - `set_parent_default_child_section_type`
  - `set_list_root_view_mode`
  - `set_task_board_section_state`
  - `set_spreadsheet_file_path`
  - `set_spreadsheet_section_settings`
  - `set_chat_section_settings`
  - `get_chat_section_chat_id` (stale chat-id clear path)
  - `set_chat_section_chat_id`
  - `set_image_area_image_path`
  - `set_chart_area_data_path`
  - `set_chart_type`
  - `set_chart_settings`
- Switched these routes from full snapshot transport to project-config patch transport:
  - `set_show_param_display_names`
  - `compare_and_set_show_param_display_names`

## Benchmark scenario

Representative high-frequency route benchmark: `set_task_board_section_state`.

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Add one top-level TaskBoard section.
4. Benchmark 40 measured iterations (5 warmup).
5. Measure end-to-end route latency (`set_task_board_section_state` + `finish_pending_operations`).
6. Capture serialized websocket payload bytes via `_broadcast_frontend(...)`.
7. Count only project-state transport messages:
   - `WebsocketMsgUpdateFrontendProjectState`
   - `WebsocketMsgPatchFrontendProjectStateSectionImpl`
8. Mutate task title each iteration to force a real state update.

Baseline emulation:
- Monkeypatch `_update_and_broadcast_section_impl_patch_no_name_validation(...)`
  to call `_update_and_broadcast_project_state_no_name_validation(...)`
  (snapshot transport).

After:
- Native section-impl patch helper behavior.

## Results (local)

`set_task_board_section_state` on 1000-param synthetic state:

- Message type:
  - baseline: `WebsocketMsgUpdateFrontendProjectState`
  - after: `WebsocketMsgPatchFrontendProjectStateSectionImpl`

- Websocket payload bytes:
  - baseline median: `761,400.0`
  - after median: `642.0`
  - reduction: `99.92%` (`~1,185.98x` smaller)

- Route latency:
  - baseline median: `175.0558 ms`
  - after median: `172.0735 ms`
  - median improvement: `~1.70%`

- Tail latency:
  - baseline p95: `271.7373 ms`
  - after p95: `274.7416 ms`
  - p95 delta: `~1.11%` slower (local noise range)

Secondary local signal for `set_show_param_display_names`:
- Payload median dropped from `~759,326.5 B` to `~3,844.0 B` (`~99.49%` smaller).
- Latency was roughly flat/slightly slower in local runs; this route remains
  dominated by shared `update(...)` compute path rather than transport size.

## Coverage

Backend:
- `tests/project_state/test_patch_transport_additional_routes.py`
  - `test_additional_section_scoped_routes_use_section_impl_patch_transport`
  - `test_show_param_display_names_routes_use_project_config_patch_transport`
- `tests/project_state/test_ui_only_fast_path.py`
  - existing patch-transport coverage still passes
