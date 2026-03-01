# Param structure + impl deferred refresh rollout

Date: 2026-03-03
Area: backend
Branch/Commit: backend-performance @ working tree

## Goal

Reduce ACK latency for remaining code-obj patch routes by removing synchronous
`_refresh_codegen_state(...)` from the route ACK path and scheduling deferred
stage-B refresh instead.

Routes migrated in this tranche:

- `set_callable`
- `change_param_impl`
- `update_param_impl_config`
- `add_kwarg`
- `delete_kwarg`
- `delete_selected_params`
- `move_params`
- `move_param_groups`
- `indent_params`
- `unindent_params`

## Change

`backend/setta/project_state/base_project_manager.py`:

- Switched the routes above from:
  - `_update_and_broadcast_code_obj_and_section_patches(...)`
- To:
  - `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`

This keeps route patch-transport scopes unchanged while deferring full codegen
refresh to stage-B.

`tests/project_state/test_param_structure_patch_transport.py`:

- Added `test_param_structure_routes_defer_codegen_refresh` to verify route ACKs
  do not call `_refresh_codegen_state(...)` synchronously and schedule one
  deferred refresh.

`tests/project_state/test_param_impl_patch_transport.py`:

- Added `test_param_impl_routes_defer_codegen_refresh` with the same deferred
  refresh assertions for:
  - `update_param_impl_config`
  - `change_param_impl`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_edge_patch_transport.py tests/project_state/test_listener_emit_patch_transport.py -q`

Result:

- `29 passed`.

## Benchmark scenario

Synthetic callable state with `1000` params, autosave disabled.

Method:

1. Compare two modes:
- `legacy_sync` (emulated): monkeypatch
  `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`
  to call `_update_and_broadcast_code_obj_and_section_patches(...)`.
- `patched`: native deferred-refresh helper.
2. Measure ACK latency as:
- route call + `finish_pending_operations(...)`.
3. After each measured op, run `_flush_pending_deferred_codegen_refresh(...)`
   and `undo(steps=1)` outside timed window to keep state deterministic.
4. Warmup/measured: `3` warmup + `12` measured per route/mode.

Routes benchmarked (representative subset):

- `add_kwarg`
- `move_params`
- `update_param_impl_config`
- `set_callable`

## Results (local)

| Route | Metric | Legacy Sync | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `add_kwarg` | latency median | 253.79 ms | 184.61 ms | +27.26% faster |
| `add_kwarg` | latency p95 | 344.75 ms | 281.02 ms | +18.49% faster |
| `move_params` | latency median | 331.74 ms | 266.50 ms | +19.67% faster |
| `move_params` | latency p95 | 418.33 ms | 379.42 ms | +9.30% faster |
| `update_param_impl_config` | latency median | 217.71 ms | 197.78 ms | +9.16% faster |
| `update_param_impl_config` | latency p95 | 315.00 ms | 248.37 ms | +21.15% faster |
| `set_callable` | latency median | 7519.43 ms | 7556.81 ms | -0.50% |
| `set_callable` | latency p95 | 7553.37 ms | 7568.51 ms | -0.20% |

## Notes

- ACK improvements are clear for param-structure/impl routes where stage-A
  merge+patch previously paid synchronous codegen refresh cost.
- `set_callable` shows near-zero impact here because its internal
  callable/signature-refetch path dominates end-to-end latency before patch ACK.
