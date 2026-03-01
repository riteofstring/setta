# section-size routes section-impl patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 25127017 (baseline emulation) -> working tree

## Goal

Reduce websocket payload and route overhead for section-size drag routes by
switching from full project-state snapshots to section-impl patch transport.

Targeted routes:
- `set_section_sizes`
- `set_section_column_width`

## Change

Backend changes:
- Added `_merge_and_broadcast_ui_only_section_impl_patches(...)` to merge once
  and emit one or more section-impl patches.
- Kept existing single-section helper and routed it through the new multi helper.
- Updated `set_section_sizes` to use section-impl patch transport for all
  requested sections.
- Updated `set_section_column_width` to use section-impl patch transport.

Multi-section sequencing:
- First patch uses `previousProjectStateRevision -> projectStateRevision`.
- Additional patches in the same merged update use
  `projectStateRevision -> projectStateRevision` so frontend revision gating
  remains consistent while applying each patch in order.

## Benchmark scenario

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Seed state via `build_state_for_ui_only_fast_path()`.
3. Benchmark 40 measured iterations (5 warmup), forcing non-coalesced history
   per iteration by clearing `history._last_entry_key/_last_entry_ts`.
4. Measure route latency (`route + finish_pending_operations`).
5. Capture websocket payload bytes by intercepting frontend broadcasts and
   measuring serialized message bytes (`message.model_dump_json()`).

Baseline emulation:
- Monkeypatch section-impl patch helpers to call
  `_merge_and_broadcast_ui_only_project_state(...)` (snapshot behavior).

After:
- Native section-impl patch behavior.

## Results (local)

- `set_section_column_width`
  - latency median: `5.0120 ms` -> `4.8218 ms` (`~3.79%`, `1.04x`)
  - payload median: `45,283 B` -> `595 B` (`~98.69%`, `76.11x` smaller)

- `set_section_sizes` (single-section request)
  - latency median: `5.1066 ms` -> `4.8037 ms` (`~5.93%`, `1.06x`)
  - payload median: `45,322 B` -> `597 B` (`~98.68%`, `75.92x` smaller)

- `set_section_sizes` (multi-section request, 2 sections)
  - latency median: `5.1430 ms` -> `4.9472 ms` (`~3.81%`, `1.04x`)
  - payload median: `45,359 B` -> `1,238 B` (`~97.27%`, `36.64x` smaller)

Notes:
- This benchmark captures serialization-sized payloads via intercepted frontend
  broadcasts and does not include network transport variability.

## Coverage

- `tests/project_state/test_ui_only_fast_path.py`
