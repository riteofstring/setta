# selection and view-mode-edit routes UI-only fast path

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 30729a60 (+ working tree)

## Goal

Remove full `update(...)` + codegen refresh work from high-frequency UI-only routes:
- `toggle_is_editing_view_mode`
- `toggle_param_selected`
- `unselect_all_params`

## Change

- Route handlers now use `_merge_and_broadcast_ui_only_project_state(...)` instead of
  `_update_and_broadcast_project_state_no_name_validation(...)`.
- This preserves UI mutation persistence + project-state websocket broadcast while
  skipping:
  - `validate_for_update(...)`
  - `_refresh_codegen_state(...)`
  - watcher refreshes tied to `updateFileWatcher=True`

Touched files:
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_ui_only_fast_path.py`

## Benchmark scenario

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Seed state via `build_state_for_ui_only_fast_path()`.
3. Benchmark each route for 40 measured iterations (5 warmup).
4. Measure end-to-end route call + `finish_pending_operations(...)`.

Route setup:
- `toggle_param_selected`: toggles one callable param ID each iteration.
- `unselect_all_params`: ensures the callable has one selected param before each
  measured call so the route executes a real clear.

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_project_state` to route through
  `_update_and_broadcast_project_state_no_name_validation` (pre-change behavior).

Command:
- `source activate.sh && python - <<'PY' ...` (local async benchmark script)

## Results (local)

- `toggle_is_editing_view_mode`
  - baseline median: `22.8511 ms`
  - baseline p95: `23.4766 ms`
  - fast-path median: `3.3514 ms`
  - fast-path p95: `3.9105 ms`
  - median speedup: `6.82x`

- `toggle_param_selected`
  - baseline median: `28.6697 ms`
  - baseline p95: `30.6587 ms`
  - fast-path median: `3.7546 ms`
  - fast-path p95: `4.4564 ms`
  - median speedup: `7.64x`

- `unselect_all_params`
  - baseline median: `59.0976 ms`
  - baseline p95: `62.8362 ms`
  - fast-path median: `8.1979 ms`
  - fast-path p95: `9.4177 ms`
  - median speedup: `7.21x`

## Coverage

- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_full_codegen_refresh`
- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_file_watcher_refresh`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/routers/test_project_manager_sort_order_routes.py`
