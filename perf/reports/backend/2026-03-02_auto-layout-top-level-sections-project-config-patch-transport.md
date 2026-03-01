# auto_layout_top_level_sections project-config patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 1e922396 (baseline emulation) -> working tree

## Goal

Remove full update/codegen/snapshot work from `auto_layout_top_level_sections`,
which only mutates `projectConfig.topLevelSections`.

## Change

Backend route change:
- Updated `auto_layout_top_level_sections` to use
  `_merge_and_broadcast_ui_only_project_config_patch(...)` instead of
  `_update_and_broadcast_project_state_no_name_validation(...)`.

Impact of this route change:
- Skips full `update(...)` path (validation + codegen refresh + watcher updates).
- Uses revisioned project-config patch transport with snapshot fallback semantics
  already implemented in `_merge_and_broadcast_ui_only_project_config_patch(...)`.

## Benchmark scenario

Representative route benchmark: `auto_layout_top_level_sections`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Seed 8 additional top-level sections (`Dict`/`Code`) to produce a realistic
   auto-layout target set.
4. Benchmark 40 measured iterations (5 warmup).
5. Measure end-to-end route latency (`auto_layout_top_level_sections` +
   `finish_pending_operations`).
6. Capture websocket payload bytes by intercepting `_broadcast_frontend(...)` and
   measuring serialized message bytes (`message.model_dump_json()`).
7. Count only project-state transport messages:
   - `WebsocketMsgUpdateFrontendProjectState`
   - `WebsocketMsgPatchFrontendProjectStateProjectConfig`

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_project_config_patch(...)` to call
  `_update_and_broadcast_project_state_no_name_validation(...)` (snapshot path).

After:
- Native project-config patch transport for `auto_layout_top_level_sections`.

## Results (local)

`auto_layout_top_level_sections` on 1000-param synthetic state:

- Message type:
  - baseline: `WebsocketMsgUpdateFrontendProjectState`
  - after: `WebsocketMsgPatchFrontendProjectStateProjectConfig`

- Websocket payload bytes:
  - baseline median: `773,398.0`
  - after median: `6,260.0`
  - reduction: `99.19%` (`~123.55x` smaller)

- Route latency:
  - baseline median: `181.3471 ms`
  - after median: `52.5458 ms`
  - median improvement: `~71.03%` (`~3.45x` faster)

- Tail latency:
  - baseline p95: `323.5425 ms`
  - after p95: `185.6482 ms`
  - p95 improvement: `~42.62%`

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.

## Coverage

Backend:
- `tests/project_state/test_project_config_view_modes.py`
  - `test_auto_layout_top_level_sections_broadcasts_project_config_patch`
