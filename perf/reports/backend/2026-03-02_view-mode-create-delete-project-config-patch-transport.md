# view-mode create/delete routes project-config patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 1208915d (baseline emulation) -> working tree

## Goal

Extend incremental project-config transport to remaining view-mode write routes that
still used full update/snapshot flow despite mutating only `projectConfig`:

- `create_view_mode`
- `delete_view_mode`

## Change

Backend routing changes:
- Updated `create_view_mode` to use
  `_merge_and_broadcast_ui_only_project_config_patch(...)`.
- Updated `delete_view_mode` to use
  `_merge_and_broadcast_ui_only_project_config_patch(...)`.
- Both routes retain existing history semantics (`project_config_only=True`) and
  now avoid full codegen refresh + full project-state snapshot transport.

## Benchmark scenario

Representative route benchmark: `create_view_mode`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Benchmark 40 measured iterations (5 warmup).
4. Measure end-to-end route latency (`create_view_mode` + `finish_pending_operations`).
5. Capture websocket payload bytes by intercepting `_broadcast_frontend(...)` and
   measuring serialized message bytes (`message.model_dump_json()`).
6. Keep state size stable by deleting the newly created view mode after each
   iteration (cleanup outside measured timing).

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_project_config_patch(...)` to call
  `_update_and_broadcast_project_state_no_name_validation(...)` (snapshot behavior).

After:
- Native project-config patch transport for `create_view_mode` and
  `delete_view_mode`.

## Results (local)

`create_view_mode` on 1000-param synthetic state:

- Message type:
  - baseline: `WebsocketMsgUpdateFrontendProjectState`
  - after: `WebsocketMsgPatchFrontendProjectStateProjectConfig`

- Websocket payload bytes:
  - baseline median: `759,620.0`
  - after median: `4,191.5`
  - reduction: `99.45%` (`~181.22x` smaller)

- Route latency:
  - baseline median: `177.9340 ms`
  - after median: `49.2123 ms`
  - median improvement: `~72.34%` (`~3.62x` faster)

- Tail latency:
  - baseline p95: `298.0192 ms`
  - after p95: `165.4785 ms`
  - p95 improvement: `~44.47%`

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.
- This benchmark measures `create_view_mode`; `delete_view_mode` uses the same
  transport helper in this change.

## Coverage

Backend:
- `tests/project_state/test_project_config_view_modes.py`
  - `test_create_view_mode_broadcasts_project_config_patch`
  - `test_delete_view_mode_broadcasts_project_config_patch`
