# param selection routes section-impl patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ c886c855 (baseline emulation) -> working tree

## Goal

Reduce websocket payload and write-path overhead for param-selection routes that
only mutate section impl state.

Targeted routes:
- `toggle_param_selected`
- `unselect_all_params`

## Change

Backend changes:
- Switched `toggle_param_selected` to
  `_merge_and_broadcast_ui_only_section_impl_patch(...)`.
- Switched `unselect_all_params` to
  `_merge_and_broadcast_ui_only_section_impl_patches(...)` using only sections
  that currently have selected params.
- Kept `set_section_pinned_params` on snapshot transport because it updates
  `shownParamIds`, which is not included in section-impl patch payloads.

Test updates:
- Added route-level patch transport coverage in
  `tests/project_state/test_ui_only_fast_path.py` for
  `toggle_param_selected` + `unselect_all_params`.
- Renamed the snapshot-route coverage test to explicitly scope it to
  `set_section_pinned_params`.

## Benchmark scenario

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Seed state via `build_state_for_ui_only_fast_path()`.
3. Benchmark 40 measured iterations (5 warmup) per route.
4. Measure route latency (`route + finish_pending_operations`).
5. Capture websocket payload bytes by intercepting frontend broadcasts and
   measuring serialized bytes (`message.model_dump_json()`).

Baseline emulation:
- Monkeypatch section-impl patch helpers to call
  `_merge_and_broadcast_ui_only_project_state(...)` (snapshot behavior).

After:
- Native section-impl patch transport.

## Results (local)

- `toggle_param_selected`
  - latency median: `3.9417 ms` -> `3.6917 ms` (`~6.34%`, `1.07x`)
  - payload median: `45,281.5 B` -> `597 B` (`~98.68%`, `75.85x` smaller)

- `unselect_all_params`
  - latency median: `2.0500 ms` -> `1.7165 ms` (`~16.27%`, `1.19x`)
  - payload median: `45,280 B` -> `598 B` (`~98.68%`, `75.72x` smaller)

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.
- `unselect_all_params` was benchmarked with one selected callable section per
  iteration to exercise a non-noop clear operation.

## Coverage

- `tests/project_state/test_ui_only_fast_path.py`
