# section-size routes UI-only fast path

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 1901af7e (+ working tree)

## Goal

Remove full update/codegen work from high-frequency section resize routes that only
touch UI state:
- `set_section_sizes`
- `set_section_column_width`

## Change

- Route handlers now call `_merge_and_broadcast_ui_only_project_state(...)` instead of
  `_update_and_broadcast_project_state_no_name_validation(...)`.
- This keeps persistence/history + project-state broadcast behavior while skipping:
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
3. Benchmark each route for 16 measured iterations (3 warmup), with 0.25s spacing to
   avoid coalescing artifacts between consecutive writes.
4. Measure end-to-end route call + `finish_pending_operations(...)`.

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_project_state` to route through
  `_update_and_broadcast_project_state_no_name_validation` (pre-change behavior).

Command:
- `source activate.sh && python - <<'PY' ...` (local async benchmark script)

## Results (local)

- `set_section_sizes`
  - baseline median: `59.5272 ms`
  - baseline p95: `64.0956 ms`
  - fast-path median: `14.0203 ms`
  - fast-path p95: `15.0013 ms`
  - median speedup: `4.25x`

- `set_section_column_width`
  - baseline median: `57.9731 ms`
  - baseline p95: `201.1300 ms`
  - fast-path median: `13.4147 ms`
  - fast-path p95: `18.5382 ms`
  - median speedup: `4.32x`

## Coverage

- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_full_codegen_refresh`
- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_routes_skip_file_watcher_refresh`
- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_fast_path_broadcasts_project_state_only`
- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_section_size_routes_preserve_undo_redo_with_coalescing`
