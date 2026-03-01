# watch_code_files single-config fast path

Date: 2026-03-02
Area: backend
Branch/Commit: backend-performance @ working tree
Related PR: n/a

## Goal

Reduce update latency by removing repeated backend-to-single-config reconstruction from code-file watcher refreshes during normal single-project updates.

Touched code paths:
- `backend/setta/project_state/code_files.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_code_files.py`
- `tests/project_state/test_single_config_state_cache.py`

## Scenario

- Entry points:
  - `BaseProjectManager.update(...)` with `updateFileWatcher=True`
  - `CodeFiles.watch_code_files(...)`
- Data set:
  - `build_callable_project_state(1000)`
- Environment:
  - local dev machine, Python env active via `source activate.sh`

## Before (baseline)

Baseline captured in this branch before this change:

- `watch_code_files(full-backend)` median: `141.291 ms`
- `update(validate_name_rules=False, updateFileWatcher=True)` median: `307.463 ms`
- `update(validate_name_rules=False, updateFileWatcher=False)` median: `150.241 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `306.062 ms`
- `update_and_broadcast_project_state(1000)` median: `333.318 ms`

## After

- `watch_code_files(full-backend)` median: `141.432 ms`
- `watch_code_files(single-config-fast-path)` median: `3.468 ms`
- `update(validate_name_rules=False, updateFileWatcher=True)` median: `170.657 ms`
- `update(validate_name_rules=False, updateFileWatcher=False)` median: `143.152 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `170.551 ms`
- `update_and_broadcast_project_state(1000)` median: `196.580 ms`

## What changed

- Added an optional single-config fast path to `CodeFiles.watch_code_files(...)`:
  - when a current `ProjectStateSingleConfig` is provided, refresh only that config's bindings.
  - skip `convert_backend_to_single_config(...)` for every config on the backend.
- Updated `BaseProjectManager._merge_project_state_backend(...)` to pass the just-updated single-config state into `watch_code_files(...)`.
- Added a conservative fallback in `BaseProjectManager.watch_code_files(...)`:
  - if any other project config shares section ids with the updated config, use full-backend refresh.
- Preserved full-backend refresh behavior for call sites that do not pass a single-config state.
- Added regression coverage ensuring the single-config path does not call `convert_backend_to_single_config(...)`.
- Added regression coverage ensuring shared-section configs force full-backend refresh.

## Conclusion

- What improved:
  - Per-update watcher refresh work dropped substantially in hot paths.
  - End-to-end update/broadcast latency on a 1000-param project dropped by roughly 40%.
- Why this is high-impact:
  - Code-file watcher refresh was a dominant cost after earlier name-validation optimizations.

## Automated Tests

- `./scripts/run_backend_tests.sh tests/project_state/test_code_files.py tests/project_state/test_single_config_state_cache.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_format_code.py tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_ui_only_fast_path.py -q` (pass)
- `ruff check backend/setta/project_state/code_files.py backend/setta/project_state/base_project_manager.py tests/project_state/test_code_files.py tests/project_state/test_single_config_state_cache.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_format_code.py tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_ui_only_fast_path.py` (pass)
- `ruff format --check backend/setta/project_state/code_files.py backend/setta/project_state/base_project_manager.py tests/project_state/test_code_files.py tests/project_state/test_single_config_state_cache.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_format_code.py tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_ui_only_fast_path.py` (pass)

## Raw Artifacts (local-only)

Benchmark outputs were captured from local ad-hoc scripts run in this workspace.
