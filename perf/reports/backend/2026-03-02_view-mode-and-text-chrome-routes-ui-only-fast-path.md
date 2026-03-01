# view-mode and text-chrome routes UI-only fast path

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 778975fb (+ working tree)

## Goal

Remove full `update(...)` + codegen refresh work from view-mode and text/meta-control
chrome routes that mutate only UI presentation state:
- `set_meta_control_show_section_title`
- `set_text_block_display_mode`
- `set_text_block_master_font_size`
- `set_text_block_meta_control_style`
- `set_active_view_mode`
- `toggle_section_visibility`
- `toggle_view_mode_user_facing`
- `toggle_view_mode_tab`
- `set_view_mode_name`
- `set_view_mode_sort_order`

## Change

- Route handlers now use `_merge_and_broadcast_ui_only_project_state(...)` instead of
  `_update_and_broadcast_project_state_no_name_validation(...)`.
- This keeps project-state persistence + websocket project-state broadcast semantics
  while skipping:
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
3. Create a second view mode via `create_view_mode(...)` so view-mode routes can
   switch/toggle/reorder between two IDs.
4. Benchmark each route for 40 measured iterations (5 warmup).
5. Measure end-to-end route call + `finish_pending_operations(...)`.

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_project_state` to route through
  `_update_and_broadcast_project_state_no_name_validation` (pre-change behavior).

Command:
- `source activate.sh && python - <<'PY' ...` (local async benchmark script)

## Results (local)

- `set_meta_control_show_section_title`
  - baseline median: `23.4641 ms`
  - baseline p95: `25.0492 ms`
  - fast-path median: `3.4807 ms`
  - fast-path p95: `3.7426 ms`
  - median speedup: `6.74x`

- `set_text_block_display_mode`
  - baseline median: `22.8866 ms`
  - baseline p95: `24.1801 ms`
  - fast-path median: `4.1855 ms`
  - fast-path p95: `4.9630 ms`
  - median speedup: `5.47x`

- `set_text_block_master_font_size`
  - baseline median: `22.7376 ms`
  - baseline p95: `24.2311 ms`
  - fast-path median: `3.7079 ms`
  - fast-path p95: `4.3947 ms`
  - median speedup: `6.13x`

- `set_text_block_meta_control_style`
  - baseline median: `23.4816 ms`
  - baseline p95: `26.1501 ms`
  - fast-path median: `4.4583 ms`
  - fast-path p95: `5.5003 ms`
  - median speedup: `5.27x`

- `set_active_view_mode`
  - baseline median: `24.4674 ms`
  - baseline p95: `27.3923 ms`
  - fast-path median: `4.0524 ms`
  - fast-path p95: `4.4762 ms`
  - median speedup: `6.04x`

- `toggle_section_visibility`
  - baseline median: `23.6124 ms`
  - baseline p95: `58.7563 ms`
  - fast-path median: `4.0569 ms`
  - fast-path p95: `4.7342 ms`
  - median speedup: `5.82x`

- `toggle_view_mode_user_facing`
  - baseline median: `23.1111 ms`
  - baseline p95: `24.0355 ms`
  - fast-path median: `3.4550 ms`
  - fast-path p95: `3.9554 ms`
  - median speedup: `6.69x`

- `toggle_view_mode_tab`
  - baseline median: `22.8202 ms`
  - baseline p95: `24.2915 ms`
  - fast-path median: `3.5982 ms`
  - fast-path p95: `4.2783 ms`
  - median speedup: `6.34x`

- `set_view_mode_name`
  - baseline median: `23.2302 ms`
  - baseline p95: `24.4443 ms`
  - fast-path median: `3.6602 ms`
  - fast-path p95: `4.2857 ms`
  - median speedup: `6.35x`

- `set_view_mode_sort_order`
  - baseline median: `22.8745 ms`
  - baseline p95: `23.8123 ms`
  - fast-path median: `3.6036 ms`
  - fast-path p95: `4.1838 ms`
  - median speedup: `6.35x`

## Coverage

- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_full_codegen_refresh`
- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_file_watcher_refresh`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/routers/test_project_manager_sort_order_routes.py`
