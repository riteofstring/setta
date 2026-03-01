# Remaining code-obj patch routes deferred refresh rollout

Date: 2026-03-03
Area: backend
Branch/Commit: backend-performance @ working tree

## Goal

Finish deferred codegen-refresh rollout for all remaining synchronous
`_update_and_broadcast_code_obj_and_section_patches(...)` call sites.

Routes/paths migrated in this tranche:

- `_refetch_callable_params(...)` (used by `auto_refetch_callable_params*` routes)
- `_broadcast_watch_code_mutation_scope(...)` non-structural mutation path
- `set_code_obj_display_name(...)`
- `format_code(...)` GenPython branch
- `accept_rename_refactor(...)`

## Change

`backend/setta/project_state/base_project_manager.py`:

- Switched all remaining route/path call sites from:
  - `_update_and_broadcast_code_obj_and_section_patches(...)`
- To:
  - `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`

Result:

- Stage-A ACK continues to merge + broadcast the same patch scopes.
- Full codegen refresh is moved to deferred stage-B via
  `_schedule_deferred_codegen_refresh(...)`.

After this change, only the helper definition of
`_update_and_broadcast_code_obj_and_section_patches(...)` remains; all call
sites now use deferred helper or other patch-transport pathways.

## Test coverage added/updated

- `tests/project_state/test_auto_refetch_history.py`
  - `test_auto_refetch_mutation_defers_codegen_refresh`
- `tests/project_state/test_watch_code.py`
  - `test_watch_code_signature_update_defers_codegen_refresh`
- `tests/project_state/test_rename_refactor_patch_transport.py`
  - `test_accept_rename_refactor_defers_codegen_refresh`
- `tests/project_state/test_param_name_value_ux.py`
  - `test_set_code_obj_display_name_defers_codegen_refresh`
- `tests/project_state/test_format_code.py`
  - Updated watcher-skip helper to support deferred-refresh assertions.
  - `test_format_code_skips_file_watcher_refresh_for_gen_python_section` now
    asserts deferred refresh scheduling (no immediate `_refresh_codegen_state`).

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_auto_refetch_history.py tests/project_state/test_watch_code.py tests/project_state/test_rename_refactor_patch_transport.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_format_code.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_auto_refetch_history.py tests/project_state/test_rename_refactor_patch_transport.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_format_code.py -q`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_watch_code.py -k "watch_code_file_update_and_delete_use_patch_transport or watch_code_signature_update_defers_codegen_refresh" -q`

Result:

- `33 passed` (`31` + `2`) across targeted suites.

## Benchmark scenario

Synthetic callable state with `1000` params, autosave disabled.

Method:

1. Compare two modes:
- `legacy_sync` (emulated): monkeypatch
  `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`
  to call `_update_and_broadcast_code_obj_and_section_patches(...)`.
- `patched`: native deferred helper behavior.
2. Measure ACK latency as:
- route/path call + `finish_pending_operations(...)`.
3. After each sample, flush deferred refresh outside the timed window with
   `_flush_pending_deferred_codegen_refresh(...)`.
4. Warmup/measured: `3` warmup + `12` measured per route.
5. For watch-code path, benchmarked signature-only updates via
   `apply_watch_code_file_update(...)` after watch inputs/enabled setup.

## Results (local)

| Route/path | Metric | Legacy Sync | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_code_obj_display_name` | latency median | 172.46 ms | 105.46 ms | +38.85% faster |
| `set_code_obj_display_name` | latency p95 | 267.11 ms | 205.08 ms | +23.22% faster |
| `accept_rename_refactor` | latency median | 164.18 ms | 93.79 ms | +42.87% faster |
| `accept_rename_refactor` | latency p95 | 254.96 ms | 98.73 ms | +61.28% faster |
| `auto_refetch_callable_params` | latency median | 139.32 ms | 117.31 ms | +15.80% faster |
| `auto_refetch_callable_params` | latency p95 | 242.22 ms | 219.82 ms | +9.25% faster |
| `watch_code_signature_update` | latency median | 207.84 ms | 137.92 ms | +33.64% faster |
| `watch_code_signature_update` | latency p95 | 316.51 ms | 234.97 ms | +25.76% faster |

## Notes

- This closes the remaining synchronous code-obj patch route/path call sites.
- Biggest ACK gains in this tranche came from:
  - `accept_rename_refactor`
  - watch-code signature updates
  - display-name edits
- `auto_refetch_callable_params` improved more modestly but still benefited from
  deferred stage-B refresh.
