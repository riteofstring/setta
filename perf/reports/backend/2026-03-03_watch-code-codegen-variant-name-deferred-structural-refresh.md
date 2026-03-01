# Watch-code, codegen, variant/name deferred structural refresh

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Complete the remaining structural-route deferred-refresh rollout for these route
families still doing synchronous `_refresh_codegen_state(...)` in ACK:

- watch-code config routes,
- codegen-target config routes,
- section variant and section naming routes.

## Change

Backend (`base_project_manager.py`):

- Switched these routes to
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`:
  - `set_project_config_codegen_targets(...)`
  - `compare_and_set_python_codegen_enabled(...)`
  - `set_watch_code_enabled(...)`
  - `compare_and_set_watch_code_enabled(...)`
  - `set_watch_code_inputs(...)`
  - `compare_and_set_watch_code_folders(...)`
  - `compare_and_set_watch_code_files(...)`
  - `set_section_variant(...)`
  - `set_default_section_variant(...)`
  - `set_section_variant_sort_order(...)`
  - `delete_section_variant_or_ask(...)`
  - `toggle_variant_json_source(...)`
  - `toggle_variant_frozen(...)`
  - `delete_json_source_file_and_variant(...)`
  - `set_section_variant_name(...)`
  - `set_section_name(...)`
  - `set_text_block_heading_as_section_name(...)`
- Preserved existing validation/broadcast flags where routes already customized
  them (for example `validate_name_rules=False` and
  `broadcast_name_validation_errors=False`).

Tests (`tests/project_state/test_structural_patch_transport.py`):

- Added `test_variant_and_name_routes_defer_codegen_refresh`.
- Added `test_watch_code_routes_defer_codegen_refresh`.
- Added `test_codegen_target_routes_defer_codegen_refresh`.
- Updated variant JSON-source delete test setup to create temp files under the
  fixture workspace root so it satisfies backend workspace path enforcement.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py -k "variant_and_name_routes_defer_codegen_refresh or watch_code_routes_use_structural_patch_transport or watch_code_routes_defer_codegen_refresh or codegen_target_routes_use_structural_patch_transport or codegen_target_routes_defer_codegen_refresh" -q`

Result:

- Ruff: passed
- Targeted backend tests: `5 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Measured representatives:

- `set_watch_code_enabled`
- `compare_and_set_python_codegen_enabled`
- `set_section_variant`
- `set_section_name`

Method:

1. Two modes:
   - `legacy_sync` (emulated): monkeypatch deferred structural helper to call
     `_update_and_broadcast_structural_patch(...)`.
   - `patched_deferred`: native helper behavior.
2. Iterations: `3` warmup + `12` measured.
3. ACK metric: route call + `finish_pending_operations(...)`.
4. In patched mode, flush deferred refresh outside timed ACK window via
   `_flush_pending_deferred_codegen_refresh(...)`.
5. Additional signals:
   - ACK-window `_refresh_codegen_state(...)` call counts.
   - Deferred schedule deltas (`_schedule_deferred_codegen_refresh(...)`).

## Results (local)

| Route | Metric | Legacy Sync | Patched Deferred | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_watch_code_enabled` | latency median | 152.41 ms | 120.70 ms | +20.80% faster |
| `set_watch_code_enabled` | latency p95 | 300.76 ms | 225.94 ms | +24.88% faster |
| `set_watch_code_enabled` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `compare_and_set_python_codegen_enabled` | latency median | 157.73 ms | 121.81 ms | +22.78% faster |
| `compare_and_set_python_codegen_enabled` | latency p95 | 269.90 ms | 130.18 ms | +51.77% faster |
| `compare_and_set_python_codegen_enabled` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `set_section_variant` | latency median | 175.88 ms | 112.77 ms | +35.88% faster |
| `set_section_variant` | latency p95 | 284.65 ms | 231.23 ms | +18.77% faster |
| `set_section_variant` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `set_section_name` | latency median | 247.77 ms | 184.94 ms | +25.36% faster |
| `set_section_name` | latency p95 | 369.29 ms | 318.84 ms | +13.66% faster |
| `set_section_name` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |

## Notes

- In patched mode, deferred schedule deltas were `12` for each measured route,
  matching one deferred schedule per measured operation.
- These results indicate stage-A ACK handling no longer performs synchronous
  full codegen refresh for this remaining structural route tranche.
