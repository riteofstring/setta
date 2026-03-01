# Param-structure history-scope backend fast path

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Recover route latency lost in the previous correctness fix by removing pre-history
`convert_backend_to_single_config(...)` calls from scoped-history routes.

## Change

Backend changes in `BaseProjectManager`:

- Replaced pre-history single-config reads with backend-state history-scope helpers
  for:
  - `set_callable`
  - `add_kwarg`
  - `delete_kwarg`
  - `delete_selected_params`
- Added backend helpers for history-target derivation without single-config conversion:
  - `_get_param_section_impl_for_backend(...)`
  - `_find_section_ids_for_code_obj_for_backend(...)`
  - `_get_callable_history_code_obj_ids_for_backend(...)`
  - `_get_add_kwarg_history_scope_for_backend(...)`
  - `_get_delete_kwarg_history_targets_for_backend(...)`
  - `_get_parent_code_obj_ids_for_section_params_for_backend(...)`
- Kept the correctness-critical ordering from prior step:
  - compute history scope from current backend revision,
  - create history entry,
  - reacquire fresh single-config state,
  - mutate/broadcast.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_edge_patch_transport.py -q`

Result:

- `19 passed`.

## Benchmark scenario

Compared route ACK latency before/after this step using identical benchmark setup.

Method:

1. `real_settings_manager()` with autosave disabled.
2. Synthetic callable state:
   - `1000` params for `add_kwarg` / `delete_kwarg`.
   - `300` params for `delete_selected_params` (single editable target param).
3. Measured route latency as `route(...) + finish_pending_operations(...)`.
4. Warmup/measured: `2` warmup + `8` measured iterations per route.
5. State reset between samples via `undo(steps=1)`.

Baseline:

- Code before this change (same branch, pre-edit), which performed an additional
  pre-history `get_single_config_state(...)` to compute history scope.

After:

- Current backend-helper fast path.

## Results (local)

| Route | Metric | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| `add_kwarg` | latency median | 338.5957 ms | 250.6771 ms | +25.97% faster |
| `add_kwarg` | latency p95 | 391.0072 ms | 339.6511 ms | +13.13% faster |
| `delete_kwarg` | latency median | 350.2734 ms | 302.0951 ms | +13.75% faster |
| `delete_kwarg` | latency p95 | 410.6120 ms | 361.8108 ms | +11.88% faster |
| `delete_selected_params` | latency median | 1651.8527 ms | 1642.3549 ms | +0.57% faster |
| `delete_selected_params` | latency p95 | 1662.4049 ms | 1741.6995 ms | -4.77% |

## Notes

- This step mostly recovers conversion overhead on kwarg routes.
- `delete_selected_params` remains dominated by heavy mutation/refresh work, so
  conversion removal has limited effect there.
- Scoped-history correctness behavior from the prior fix is preserved.
