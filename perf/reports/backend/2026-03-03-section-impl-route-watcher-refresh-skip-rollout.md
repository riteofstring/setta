# Section-impl route watcher-refresh skip rollout

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce ACK-path latency for section-impl patch routes that do not change watched
file-path registrations (code/json-source/artifact watcher inputs).

## Change

Backend (`base_project_manager.py`): pass `updateFileWatcher=False` for these
`_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh(...)`
call sites:

- `set_type_error_ignore`
- `set_code_section_diagnostics_mute`
- `set_code_section_diagnostic_code_suppression`
- `set_parent_default_child_section_type`
- `set_list_root_view_mode`
- `set_spreadsheet_file_path`
- `set_spreadsheet_section_settings`
- `set_chat_section_settings`
- `get_chat_section_chat_id`
- `set_chat_section_chat_id`
- `set_chart_type`
- `set_chart_settings`

Intentionally unchanged (watcher refresh still enabled):

- `set_code_file_binding`
- `set_image_area_image_path`
- `set_chart_area_data_path`

Tests:

- Extended `tests/project_state/test_patch_transport_additional_routes.py` to
  capture watcher refresh hook calls and assert per-route watcher deltas:
  - `0` for the routes above
  - nonzero (`4`) for file-path mutators that should still refresh watchers.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_task_board_deferred_refresh.py`
- `source activate.sh && ruff format --check backend/setta/project_state/base_project_manager.py tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_task_board_deferred_refresh.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_task_board_deferred_refresh.py tests/project_state/test_chat_section_chat_id.py -q`

Result:

- Ruff check: passed
- Ruff format check: passed
- Backend tests: `8 passed`

## Benchmark scenario

Environment:

- Local dev machine
- Python env via `source activate.sh`
- Autosave disabled

State shape:

- `build_callable_project_state(1000)`
- Added benchmark sections: code, group, list-root, spreadsheet, chat, chart

Method:

1. For each route, compare two modes:
   - `legacy_forced_watcher_refresh` (emulated): monkeypatch
     `_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh` to
     force `updateFileWatcher=True`.
   - `patched_watcher_skip`: native behavior.
2. Per route/mode: `3` warmup + `12` measured iterations.
3. Route latency metric: `route(...) + finish_pending_operations(...)`.
4. Watcher metric: count calls to:
   - `watch_json_source_files`
   - `watch_artifact_files`
   - `watch_code_files`
   - `watch_code_manager.sync_from_backend`

## Results (local)

| Route | Metric | Legacy Forced | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_type_error_ignore` | latency median | 118.65 ms | 92.20 ms | +22.30% faster |
| `set_type_error_ignore` | latency p95 | 224.22 ms | 239.14 ms | -6.66% |
| `set_type_error_ignore` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_code_section_diagnostics_mute` | latency median | 153.37 ms | 126.66 ms | +17.42% faster |
| `set_code_section_diagnostics_mute` | latency p95 | 293.28 ms | 264.38 ms | +9.85% faster |
| `set_code_section_diagnostics_mute` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_code_section_diagnostic_code_suppression` | latency median | 153.40 ms | 127.77 ms | +16.71% faster |
| `set_code_section_diagnostic_code_suppression` | latency p95 | 305.37 ms | 284.77 ms | +6.75% faster |
| `set_code_section_diagnostic_code_suppression` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_parent_default_child_section_type` | latency median | 104.03 ms | 77.87 ms | +25.14% faster |
| `set_parent_default_child_section_type` | latency p95 | 235.90 ms | 167.73 ms | +28.90% faster |
| `set_parent_default_child_section_type` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_list_root_view_mode` | latency median | 104.84 ms | 78.63 ms | +25.00% faster |
| `set_list_root_view_mode` | latency p95 | 210.35 ms | 183.18 ms | +12.92% faster |
| `set_list_root_view_mode` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_spreadsheet_file_path` | latency median | 104.24 ms | 76.14 ms | +26.96% faster |
| `set_spreadsheet_file_path` | latency p95 | 199.89 ms | 166.38 ms | +16.76% faster |
| `set_spreadsheet_file_path` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_spreadsheet_section_settings` | latency median | 103.49 ms | 78.27 ms | +24.37% faster |
| `set_spreadsheet_section_settings` | latency p95 | 209.27 ms | 167.05 ms | +20.18% faster |
| `set_spreadsheet_section_settings` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_chat_section_settings` | latency median | 103.43 ms | 78.54 ms | +24.07% faster |
| `set_chat_section_settings` | latency p95 | 208.42 ms | 167.23 ms | +19.76% faster |
| `set_chat_section_settings` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_chat_section_chat_id` | latency median | 105.26 ms | 76.83 ms | +27.00% faster |
| `set_chat_section_chat_id` | latency p95 | 204.30 ms | 184.09 ms | +9.89% faster |
| `set_chat_section_chat_id` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_chart_type` | latency median | 104.75 ms | 77.86 ms | +25.68% faster |
| `set_chart_type` | latency p95 | 191.85 ms | 179.72 ms | +6.32% faster |
| `set_chart_type` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |
| `set_chart_settings` | latency median | 104.43 ms | 75.63 ms | +27.57% faster |
| `set_chart_settings` | latency p95 | 194.28 ms | 176.17 ms | +9.32% faster |
| `set_chart_settings` | watcher refresh calls (12 iters) | 48 | 0 | -100.00% |

## Notes

- The deterministic outcome is complete removal of redundant watcher refresh fanout
  on these routes (`48 -> 0` calls per 12 measured iterations).
- Median ACK latency improved on every measured route, with most routes in the
  ~17-28% faster range locally.
- One p95 metric (`set_type_error_ignore`) regressed in this local sample; this
  route still showed a strong median improvement and full watcher-fanout removal.
