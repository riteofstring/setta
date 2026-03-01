# save payload copy-on-write

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Remove deep-copy payload materialization from the save worker hot path while
preserving save sanitization behavior (password stripping and json-source value
scrubbing).

## Change

Architecture:
- Replaced save payload `model_copy(deep=True)` with copy-on-write payload
  creation:
  - `_copy_backend_for_save_payload(...)`
  - `_copy_single_config_for_save_payload(...)`
- Save payloads now shallow-copy top-level maps up front and rely on targeted
  copy-on-write for objects that are actually mutated during sanitization.

Sanitization safety:
- Updated `remove_json_source_values(...)` to deep-copy touched code obj core /
  variant / impl entries before calling `set_effective_impl_value(...)`.
- This prevents save-time cleanup from mutating live in-memory backend state.

## Measurement method

Synthetic benchmark:
1. Build callable project state with `1000` and `2000` params.
2. Merge into backend once.
3. Measure medians over 60 iterations (10 warmup):
   - Baseline main-mode materialization: `backend.model_copy(deep=True)`
   - After main-mode materialization: `_copy_backend_for_save_payload(...)`
   - Baseline settings-mode materialization:
     `convert_backend_to_single_config(...) + model_copy(deep=True)`
   - After settings-mode materialization:
     `convert_backend_to_single_config(...) + _copy_single_config_for_save_payload(...)`

## Results (local)

- 1000 params
  - main-mode payload materialization: `37.491 ms -> 0.519 ms`
    (`98.62%` reduction, `72.24x` faster)
  - settings-mode payload materialization: `90.881 ms -> 51.655 ms`
    (`43.16%` reduction, `1.76x` faster)

- 2000 params
  - main-mode payload materialization: `75.823 ms -> 1.169 ms`
    (`98.46%` reduction, `64.86x` faster)
  - settings-mode payload materialization: `185.582 ms -> 104.719 ms`
    (`43.57%` reduction, `1.77x` faster)

Notes:
- Settings-mode remains dominated by `convert_backend_to_single_config(...)`;
  this change specifically removes the additional deep-copy overhead after that
  conversion.

## Coverage

- `tests/project_state/test_manual_save_queue.py`
- `tests/project_state/test_manual_save_autosave.py`
- `tests/project_state/test_autosave_cancellation.py`
- `tests/project_state/test_json_source_patch_transport.py`
- `tests/project_state/jsonSource/test_json_source_save_nested_paths.py`
- `tests/project_state/jsonSource/`
- `tests/project_state/test_set_callable_undo_redo_stress.py`
