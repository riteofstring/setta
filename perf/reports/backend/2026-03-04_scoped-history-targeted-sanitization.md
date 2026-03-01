# scoped-history targeted sanitization (section/code-obj)

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce history-entry construction cost for scoped copy modes by removing
full-project `prepare_sections_for_copy(...)` from:

- `_copy_backend_for_section_impl_only_history_entry(...)`
- `_copy_backend_for_code_obj_only_history_entry(...)`

while preserving stale-reference sanitization guarantees needed for undo/redo.

## Change

`BaseProjectManager` updates:

- Added single-pass active variant collection:
  - `_collect_active_code_obj_variant_ids_for_project_config(...)`
- Reused that map for all code-obj scoped-history callers:
  - `_build_scoped_code_obj_history_ids(...)`
  - `_add_section_and_code_obj_scoped_history_entry(...)`
  - `_add_project_config_and_scoped_history_entry(...)`
  - `_copy_backend_for_code_obj_only_history_entry(...)`
- Replaced full `prepare_sections_for_copy(...)` in scoped copy helpers with
  targeted copy+sanitize helpers:
  - `_copy_and_sanitize_section_impl_for_scoped_history_entry(...)`
  - `_copy_and_sanitize_code_obj_impl_for_scoped_history_entry(...)`
- Added regression coverage for stale map/param cleanup in scoped history copy.

## Verification

- `pytest tests/project_state/test_scoped_history_copy.py tests/project_state/test_code_obj_scoped_history_copy.py -q`
- `pytest tests/project_state/test_structural_patch_transport.py -q`
- `pytest tests/project_state/test_single_config_state_cache.py tests/project_state/test_set_param_entered_value_ux.py -q`
- `pytest tests/project_state -q`

## Benchmark Scenario

Method (local microbenchmark):

1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable state via `build_callable_project_state(...)`.
3. Measure 40 iterations average for each function call.
4. Compare:
   - baseline emulation: previous implementation using
     `prepare_sections_for_copy(...)` inside scoped helper
   - optimized: current targeted-copy helper

## Results (local)

`params=1000`

- `section_impl_only` copy:
  - baseline: `22.026 ms`
  - optimized: `5.039 ms`
  - speedup: `4.37x` (`~77.1%` faster)
- `code_obj_only` copy:
  - baseline: `22.279 ms`
  - optimized: `7.335 ms`
  - speedup: `3.04x` (`~67.1%` faster)

`params=2000`

- `section_impl_only` copy:
  - baseline: `49.935 ms`
  - optimized: `14.187 ms`
  - speedup: `3.52x` (`~71.6%` faster)
- `code_obj_only` copy:
  - baseline: `49.146 ms`
  - optimized: `14.557 ms`
  - speedup: `3.38x` (`~70.4%` faster)

## Notes

- This optimization is architectural: scoped history copy now only sanitizes
  data it actually copies, instead of materializing and traversing the entire
  project-config graph on every scoped snapshot.
