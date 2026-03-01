# param-visibility routes section-impl patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 4a9b2211 (baseline emulation) -> working tree

## Goal

Reduce websocket payload and write-path overhead for section param-visibility UI
routes that mutate section impl state only.

Targeted routes:
- `set_section_param_filter`
- `set_callable_hide_params`
- `set_section_hide_unpinned_params`

## Change

Backend changes:
- Switched each target route from
  `_merge_and_broadcast_ui_only_project_state(...)` to
  `_merge_and_broadcast_ui_only_section_impl_patch(...)`.
- Kept route semantics unchanged (same section impl mutation, same validation
  behavior, no file-watcher refresh).

Test updates:
- Added patch-transport coverage for these routes in
  `tests/project_state/test_ui_only_fast_path.py`.

## Benchmark scenario

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Seed state via `build_state_for_ui_only_fast_path()`.
3. Benchmark 40 measured iterations (5 warmup) per route.
4. Measure route latency (`route + finish_pending_operations`).
5. Capture websocket payload bytes by intercepting frontend broadcasts and
   measuring serialized bytes (`message.model_dump_json()`).

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_section_impl_patch(...)` to call
  `_merge_and_broadcast_ui_only_project_state(...)` (snapshot behavior).

After:
- Native section-impl patch transport for the target routes.

## Results (local)

- `set_section_param_filter`
  - latency median: `3.9478 ms` -> `3.6848 ms` (`~6.66%`, `1.07x`)
  - payload median: `45,318 B` -> `599 B` (`~98.68%`, `75.66x` smaller)

- `set_callable_hide_params`
  - latency median: `3.9206 ms` -> `3.6637 ms` (`~6.55%`, `1.07x`)
  - payload median: `45,336.5 B` -> `599 B` (`~98.68%`, `75.69x` smaller)

- `set_section_hide_unpinned_params`
  - latency median: `3.9474 ms` -> `3.6816 ms` (`~6.73%`, `1.07x`)
  - payload median: `45,364.5 B` -> `601 B` (`~98.68%`, `75.48x` smaller)

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.

## Coverage

- `tests/project_state/test_ui_only_fast_path.py`
