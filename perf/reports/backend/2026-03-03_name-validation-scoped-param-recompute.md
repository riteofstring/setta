# Name-validation scoped param recompute

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce route ACK latency for name-affecting param/code-obj mutations by replacing
full-project param name-validation recompute with section-scoped param
recompute when patch routes already know the touched section/code-obj scope.

Targeted high-edit routes:

- `set_code_obj_name`
- `set_param_name_and_value`

## Change

Backend:

- Added scoped collector API in `name_validation.py`:
  - `collect_param_name_errors_for_sections(project_state, section_ids)`
- Added name-validation cache fields in `BaseProjectManager`:
  - cached last broadcast payload per project config
  - cached param-error-id membership per section per project config
- Added section-scope derivation helper for code-obj/section patch routes:
  - `_build_name_validation_section_scope_for_patch(...)`
- Updated patch helpers to pass section scope into name-validation broadcast:
  - `_update_and_broadcast_code_obj_and_section_patches(...)`
  - `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`
  - `_update_and_broadcast_section_impl_patches(...)`
- Updated `_broadcast_name_validation_errors(...)`:
  - still recomputes project + section name errors globally
  - recomputes param errors only for touched sections when cache is available
  - falls back to full param recompute when cache/scope is unavailable
- Cleans name-validation caches on project-config deletion.

Tests:

- Added `tests/project_state/test_name_validation_scoped_recompute.py`
  - verifies warm-cache flow uses scoped collector on subsequent
    `set_code_obj_name` calls.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py backend/setta/utils/name_validation.py tests/project_state/test_name_validation_scoped_recompute.py`
- `source activate.sh && ruff format backend/setta/project_state/base_project_manager.py`
- `source activate.sh && ruff format --check backend/setta/project_state/base_project_manager.py backend/setta/utils/name_validation.py tests/project_state/test_name_validation_scoped_recompute.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_name_validation_scoped_recompute.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_structural_patch_transport.py -k "code_obj_name_uses_scoped_param_name_validation_after_cache_warmup or set_param_name_and_value_preserves_broadcast_shape_and_mutation or set_code_obj_name_preserves_broadcast_shape_and_mutation or set_param_entered_value_uses_code_obj_patch_transport or set_param_name_and_value_uses_code_obj_patch_transport or watch_code_routes_use_structural_patch_transport or codegen_target_routes_use_structural_patch_transport or watch_code_routes_defer_codegen_refresh or codegen_target_routes_defer_codegen_refresh" -q`

Result:

- Ruff check: passed
- Ruff format check: passed
- Targeted backend tests: `7 passed`

## Benchmark scenario

Environment:

- Local dev machine
- Python env via `source activate.sh`
- Autosave disabled

State shape:

- Synthetic project with `4` callable sections
- `400` params per section (`1600` params total)

Method:

1. Two modes:
   - `legacy_full_param_validation` (emulated): monkeypatch
     `_broadcast_name_validation_errors(...)` to ignore provided section scope
     and always execute full param recompute.
   - `patched_scoped_param_validation`: native scoped behavior.
2. Instrumented collector call counts:
   - `collect_param_name_errors(...)`
   - `collect_param_name_errors_for_sections(...)`
3. Disabled deferred refresh scheduling to isolate stage-A ACK path.
4. Per route/mode: `3` warmup + `12` measured iterations.
5. Metric: route call + `finish_pending_operations(...)` latency.

## Results (local)

| Route | Metric | Legacy Full | Patched Scoped | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_code_obj_name` | latency median | 182.18 ms | 156.71 ms | +13.98% faster |
| `set_code_obj_name` | latency p95 | 279.66 ms | 170.94 ms | +38.87% faster |
| `set_code_obj_name` | full collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_code_obj_name` | scoped collector calls (12 iters) | 0 | 12 | switched to scoped |
| `set_param_name_and_value` | latency median | 191.46 ms | 164.83 ms | +13.91% faster |
| `set_param_name_and_value` | latency p95 | 283.17 ms | 174.63 ms | +38.33% faster |
| `set_param_name_and_value` | full collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_param_name_and_value` | scoped collector calls (12 iters) | 0 | 12 | switched to scoped |

## Notes

- This tranche specifically removes avoidable full param-validation recompute from
  high-frequency param/code-obj mutation routes once cache is warm.
- Benefit scales with number/size of unaffected sections; larger multi-section
  projects show stronger gains than single-section synthetic states.
