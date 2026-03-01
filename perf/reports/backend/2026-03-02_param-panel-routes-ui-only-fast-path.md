# param-panel routes UI-only fast path

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 23b13dc4 (+ working tree)

## Goal

Remove full `update(...)` + codegen refresh work from param-panel display routes that
do not affect codegen outputs:
- `set_section_param_filter`
- `set_callable_hide_params`
- `set_section_hide_unpinned_params`
- `set_section_pinned_params`

## Change

- Route handlers now use `_merge_and_broadcast_ui_only_project_state(...)` instead of
  `_update_and_broadcast_project_state_no_name_validation(...)`.
- Added `ProjectStateSingleConfig.refresh_shown_param_ids_for_section(section_id)` and
  used it in `set_section_pinned_params` so pinned/unpinned derived UI state remains
  correct without full-state recompute.

Touched files:
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/project_state.py`
- `tests/project_state/test_ui_only_fast_path.py`

## Benchmark scenario

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Seed state via `build_state_for_ui_only_fast_path()`.
3. Benchmark each route for 40 measured iterations (5 warmup).
4. Measure end-to-end route call + `finish_pending_operations(...)`.

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_project_state` to route through
  `_update_and_broadcast_project_state_no_name_validation` (pre-change behavior).

Command:
- `source activate.sh && python - <<'PY' ...` (local async benchmark script)

## Results (local)

- `set_section_param_filter`
  - baseline median: `27.3631 ms`
  - baseline p95: `29.0203 ms`
  - fast-path median: `3.5757 ms`
  - fast-path p95: `4.3110 ms`
  - median speedup: `7.65x`

- `set_callable_hide_params`
  - baseline median: `27.8007 ms`
  - baseline p95: `29.6639 ms`
  - fast-path median: `3.6233 ms`
  - fast-path p95: `4.1842 ms`
  - median speedup: `7.67x`

- `set_section_hide_unpinned_params`
  - baseline median: `27.6800 ms`
  - baseline p95: `29.5872 ms`
  - fast-path median: `3.5856 ms`
  - fast-path p95: `3.9404 ms`
  - median speedup: `7.72x`

- `set_section_pinned_params`
  - baseline median: `28.7000 ms`
  - baseline p95: `30.8030 ms`
  - fast-path median: `4.2450 ms`
  - fast-path p95: `4.5594 ms`
  - median speedup: `6.76x`

## Coverage

- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_full_codegen_refresh`
- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_file_watcher_refresh`
- `tests/project_state/test_ui_only_fast_path.py::test_set_section_pinned_params_fast_path_matches_full_validation`
