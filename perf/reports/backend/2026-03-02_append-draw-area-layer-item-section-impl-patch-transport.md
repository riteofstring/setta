# append_draw_area_layer_item section-impl patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 30f1998c (baseline emulation) -> working tree

## Goal

Remove full update/snapshot transport from `append_draw_area_layer_item`, which
mutates only draw section-impl UI state (`layers`) and does not change codegen
outputs.

## Change

Backend route change:
- Updated `append_draw_area_layer_item` to use
  `_merge_and_broadcast_ui_only_section_impl_patch(...)` instead of
  `_update_and_broadcast_project_state_no_name_validation(...)`.

Impact of this route change:
- Skips full `update(...)` path (validation + codegen refresh + watcher updates).
- Emits a revisioned section-impl patch with existing snapshot fallback semantics
  in the section-impl patch helper.

## Benchmark scenario

Representative route benchmark: `append_draw_area_layer_item`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Add one top-level Draw section.
4. Benchmark 40 measured iterations (5 warmup).
5. Measure end-to-end route latency (`append_draw_area_layer_item` +
   `finish_pending_operations`).
6. Capture websocket payload bytes by intercepting `_broadcast_frontend(...)` and
   measuring serialized message bytes (`message.model_dump_json()`).
7. Count only project-state transport messages:
   - `WebsocketMsgUpdateFrontendProjectState`
   - `WebsocketMsgPatchFrontendProjectStateSectionImpl`
8. Append a unique draw layer item each iteration to ensure each call mutates
   draw state (no duplicate/no-op short-circuit).

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_section_impl_patch(...)` to call
  `_update_and_broadcast_project_state_no_name_validation(...)` (snapshot path).

After:
- Native section-impl patch transport for `append_draw_area_layer_item`.

## Results (local)

`append_draw_area_layer_item` on 1000-param synthetic state:

- Message type:
  - baseline: `WebsocketMsgUpdateFrontendProjectState`
  - after: `WebsocketMsgPatchFrontendProjectStateSectionImpl`

- Websocket payload bytes:
  - baseline median: `763,870.0`
  - after median: `640.0`
  - reduction: `99.92%` (`~1193.55x` smaller)

- Route latency:
  - baseline median: `177.9000 ms`
  - after median: `49.3299 ms`
  - median improvement: `~72.27%` (`~3.61x` faster)

- Tail latency:
  - baseline p95: `277.7460 ms`
  - after p95: `136.4467 ms`
  - p95 improvement: `~50.89%`

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.

## Coverage

Backend:
- `tests/project_state/test_ui_only_fast_path.py`
  - `test_ui_only_routes_skip_full_codegen_refresh` (includes draw append)
  - `test_ui_only_routes_skip_file_watcher_refresh` (includes draw append)
  - `test_ui_only_draw_routes_broadcast_section_impl_patch`
