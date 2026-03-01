# group/layout routes section-impl patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 354af083 (baseline emulation) -> working tree

## Goal

Reduce websocket payload and write-path overhead for section chrome/group layout
routes that only mutate section impl state.

Targeted routes:
- `toggle_minimized`
- `toggle_group_orientation`
- `set_group_overflow_mode`
- `toggle_position_locks`

## Change

Backend changes:
- Switched single-section routes to
  `_merge_and_broadcast_ui_only_section_impl_patch(...)`:
  - `toggle_minimized`
  - `toggle_group_orientation`
  - `set_group_overflow_mode`
- Switched multi-section route to
  `_merge_and_broadcast_ui_only_section_impl_patches(...)`:
  - `toggle_position_locks`

Test updates:
- Added route-level patch transport coverage in
  `tests/project_state/test_ui_only_fast_path.py`, including multi-section
  revision sequencing assertions for `toggle_position_locks`.

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

- `toggle_minimized`
  - latency median: `3.9736 ms` -> `3.7085 ms` (`~6.67%`, `1.07x`)
  - payload median: `45,319.5 B` -> `598 B` (`~98.68%`, `75.79x` smaller)

- `toggle_group_orientation`
  - latency median: `3.6911 ms` -> `3.3971 ms` (`~7.97%`, `1.09x`)
  - payload median: `45,349.5 B` -> `642 B` (`~98.58%`, `70.64x` smaller)

- `set_group_overflow_mode`
  - latency median: `3.7073 ms` -> `3.4194 ms` (`~7.77%`, `1.08x`)
  - payload median: `45,370.5 B` -> `644 B` (`~98.58%`, `70.45x` smaller)

- `toggle_position_locks` (2 sections)
  - latency median: `3.9887 ms` -> `3.7664 ms` (`~5.57%`, `1.06x`)
  - payload median: `45,430 B` -> `1,244 B` (`~97.26%`, `36.52x` smaller)

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.

## Coverage

- `tests/project_state/test_ui_only_fast_path.py`
