# set_top_level_section_layout conversion elimination

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ b89551d1 (baseline emulation) -> working tree

## Goal

Reduce no-op `set_top_level_section_layout` latency by removing the hot-path
`convert_backend_to_single_config(...)` call used only to derive top-level
section validity.

## Change

Backend changes:
- Replaced `set_top_level_section_layout` parent-map derivation via
  `convert_backend_to_single_config(...).parentSectionMap` with direct
  backend-state traversal.
- Added `_get_active_section_impl_from_backend(...)`:
  - resolves active variant + impl directly from backend dictionaries
  - applies effective modifiers only when shared/variant modifiers are present
- Added `_collect_valid_top_level_section_ids(...)` to compute top-level ids
  without constructing a full single-config state.

Behavioral guardrail:
- Added regression test that fails if `set_top_level_section_layout` ever calls
  `convert_backend_to_single_config`.

## Benchmark scenario

Representative route benchmark: `set_top_level_section_layout` no-op write
(unchanged layout snapshot).

Method:
1. Use `real_project_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Update manager once, then benchmark repeated no-op
   `set_top_level_section_layout` calls.
4. Measure end-to-end route latency (`set_top_level_section_layout` +
   `finish_pending_operations`) for 80 measured iterations (5 warmup).
5. Baseline emulation monkeypatches `_collect_valid_top_level_section_ids` to
   the pre-change logic that calls `convert_backend_to_single_config(...)`.

## Results (local)

`set_top_level_section_layout` no-op on 1000-param synthetic state:

- Route latency (baseline emulation):
  - median: `42.7726 ms`
  - p95: `45.7992 ms`

- Route latency (after):
  - median: `0.0383 ms`
  - p95: `0.0413 ms`

- Improvement:
  - median: `~99.91%`
  - p95: `~99.91%`

## Coverage

Backend:
- `tests/project_state/test_project_config_view_modes.py::test_set_top_level_section_layout_avoids_single_config_conversion`
- Existing top-level layout behavior tests in the same file continue to pass
  (deleted section filtering, reparent filtering, missing valid top-level
  insertion).
