# Param-structure scoped-history state refresh fix

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Fix scoped-history correctness for param-structure routes by avoiding stale
single-config state reuse after a history entry is created.

## Change

Backend (`backend/setta/project_state/base_project_manager.py`):

- Updated these routes to reacquire single-config state after adding history:
  - `set_callable`
  - `add_kwarg`
  - `delete_kwarg`
  - `delete_selected_params`
- Route flow is now:
  1. read pre-history state only to compute history scope IDs,
  2. add scoped history entry,
  3. reacquire fresh single-config state from the new history revision,
  4. apply mutation + patch transport.
- This prevents merge from reintroducing old object references and losing
  scoped-history deep copies.

Tests:

- `tests/project_state/test_code_obj_scoped_history_copy.py`
  - `test_delete_selected_params_history_copy_isolates_parent_graph_and_codegen_singletons`
    now passes with the route fix.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_code_obj_scoped_history_copy.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_edge_patch_transport.py -q`

Result:

- `19 passed`.

## Benchmark scenario

Because legacy stale-state mode corrupts history on undo in hot-loop runs
(`KeyError` during `convert_backend_to_single_config(...)` after old-flow
mutations), latency was measured as cold runs (fresh fixture per sample).

Modes:

- `legacy_stale_state`: manual emulation of pre-fix route flow (reuse
  pre-history single-config object for mutation after history entry).
- `patched`: current route behavior.

Route/data:

- `add_kwarg`, `delete_kwarg` on synthetic callable state with `1000` params
  (`warmup=1`, `measured=6`).
- `delete_selected_params` on synthetic callable state with `300` params
  (`warmup=1`, `measured=4`, deleting `param-1` with editable-name enabled).

Metric:

- Route ACK latency (`route(...)` + `finish_pending_operations(...)`).

## Results (local)

| Route | Metric | Legacy stale-state | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `add_kwarg` | latency median | 255.5890 ms | 354.0626 ms | -38.53% |
| `add_kwarg` | latency p95 | 358.3192 ms | 417.2188 ms | -16.44% |
| `delete_kwarg` | latency median | 267.0592 ms | 364.3629 ms | -36.44% |
| `delete_kwarg` | latency p95 | 387.3770 ms | 425.4549 ms | -9.83% |
| `delete_selected_params` | latency median | 1623.4249 ms | 1702.4244 ms | -4.87% |
| `delete_selected_params` | latency p95 | 1631.3963 ms | 1762.1775 ms | -8.02% |

## Notes

- This fix is correctness-first: it preserves scoped-history isolation and
  avoids stale-reference history corruption.
- Latency regresses due to the extra `get_single_config_state(...)` call after
  history creation, but the old behavior is not safe because undo can fail.
- Patch transport payload behavior is unchanged in this step.
