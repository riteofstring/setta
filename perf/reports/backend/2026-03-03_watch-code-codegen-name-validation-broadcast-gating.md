# Watch-code/codegen name-validation broadcast gating

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Start the next optimization path (name-validation broadcast cost) by removing
name-validation recomputation/broadcast from routes that cannot change project,
section, or param name validity.

Targeted route family:

- watch-code configuration routes
- codegen-target configuration routes

## Change

Backend (`base_project_manager.py`):

- Added `broadcast_name_validation_errors=False` when calling
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)` in:
  - `set_watch_code_enabled(...)`
  - `compare_and_set_watch_code_enabled(...)`
  - `set_watch_code_inputs(...)`
  - `compare_and_set_watch_code_folders(...)`
  - `compare_and_set_watch_code_files(...)`
  - `set_project_config_codegen_targets(...)`
  - `compare_and_set_python_codegen_enabled(...)`

Rationale:

- These routes mutate watch/codegen settings and singleton sections, but they do
  not mutate section names, param names, or project name.
- Skipping validation broadcast here removes avoidable
  `_broadcast_name_validation_errors(...)` work while keeping transport and
  deferred refresh behavior unchanged.

Tests (`tests/project_state/test_structural_patch_transport.py`):

- Updated route-level patch-transport assertions for the routes above to expect
  `0` name-validation broadcasts instead of `1`.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_ui_setting_reveal_leases.py tests/project_state/test_watch_code.py -k "watch_code_routes_use_structural_patch_transport or codegen_target_routes_use_structural_patch_transport or watch_code_routes_defer_codegen_refresh or codegen_target_routes_defer_codegen_refresh or compare_and_set_watch_code_noops_are_side_effect_free or compare_and_set_python_codegen_enabled_same_value_is_noop_preserves_order or scan_skips_when_watch_code_disabled or watch_code_file_update_and_delete_use_patch_transport" -q`

Result:

- Ruff: passed
- Targeted backend tests: `8 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Measured routes:

- `set_watch_code_enabled`
- `set_watch_code_inputs`
- `compare_and_set_watch_code_files`
- `compare_and_set_python_codegen_enabled`

Additional check:

- single-run `set_project_config_codegen_targets`

Method:

1. Two modes:
   - `legacy_with_name_validation` (emulated): monkeypatch
     `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`
     to force `broadcast_name_validation_errors=True`.
   - `patched_no_name_validation`: native behavior.
2. Disable deferred refresh scheduling in both modes during benchmark to isolate
   stage-A ACK work (`_schedule_deferred_codegen_refresh` monkeypatched to no-op).
3. Iterations: `3` warmup + `12` measured.
4. ACK metric: route call + `finish_pending_operations(...)`.
5. Additional signal: counted `_broadcast_name_validation_errors(...)` calls.

## Results (local)

| Route | Metric | Legacy (forced validation) | Patched (gated) | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_watch_code_enabled` | latency median | 87.31 ms | 63.17 ms | +27.65% faster |
| `set_watch_code_enabled` | latency p95 | 96.47 ms | 174.94 ms | -81.33% |
| `set_watch_code_enabled` | name-validation calls (total, 12 iters) | 12 | 0 | -100.00% |
| `set_watch_code_inputs` | latency median | 127.17 ms | 104.98 ms | +17.45% faster |
| `set_watch_code_inputs` | latency p95 | 226.35 ms | 207.55 ms | +8.30% faster |
| `set_watch_code_inputs` | name-validation calls (total, 12 iters) | 12 | 0 | -100.00% |
| `compare_and_set_watch_code_files` | latency median | 82.56 ms | 60.08 ms | +27.22% faster |
| `compare_and_set_watch_code_files` | latency p95 | 180.80 ms | 157.76 ms | +12.74% faster |
| `compare_and_set_watch_code_files` | name-validation calls (total, 12 iters) | 12 | 0 | -100.00% |
| `compare_and_set_python_codegen_enabled` | latency median | 86.07 ms | 67.27 ms | +21.85% faster |
| `compare_and_set_python_codegen_enabled` | latency p95 | 185.03 ms | 159.14 ms | +13.99% faster |
| `compare_and_set_python_codegen_enabled` | name-validation calls (total, 12 iters) | 12 | 0 | -100.00% |
| `set_project_config_codegen_targets` (single run) | latency | 124.70 ms | 102.33 ms | +17.94% faster |
| `set_project_config_codegen_targets` (single run) | name-validation calls | 1 | 0 | -100.00% |

## Notes

- Median latency improved across all measured routes after removing unnecessary
  validation work.
- `set_watch_code_enabled` p95 was noisy in this local run despite improved
  median; repeated runs are recommended for tail-latency trend confirmation.
- This is a first step in the name-validation optimization path; next step is
  scoped/incremental recomputation for routes that legitimately require
  name-validation updates.
