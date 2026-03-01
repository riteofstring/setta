# Codegen-target scoped history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Remove remaining full project-config history copies from codegen-target routes while preserving undo/redo correctness for codegen singleton section changes.

## Change

Backend (`base_project_manager.py`):

- Added `_add_codegen_target_scoped_history_entry(project_config_id)`.
- Updated these routes to use the new scoped helper instead of `add_new_history_entry(project_config_id=...)`:
  - `set_project_config_codegen_targets`
  - `compare_and_set_python_codegen_enabled`
- New scoped history behavior:
  - always includes `include_project_config=True`
  - always passes `section_impl_only_ids` as the current codegen singleton section set
  - preserves empty-set scope (no singleton sections) to avoid falling back to full project-config history copy.

Tests:

- Added scoped-history assertions in `tests/project_state/test_scoped_history_copy.py`:
  - `test_set_project_config_codegen_targets_history_uses_scoped_project_config_copy`
  - `test_compare_and_set_python_codegen_enabled_history_uses_empty_scoped_copy`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_scoped_history_copy.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_scoped_history_copy.py tests/project_state/test_structural_patch_transport.py -k "codegen_target_routes_use_structural_patch_transport or set_project_config_codegen_targets_history_uses_scoped_project_config_copy or compare_and_set_python_codegen_enabled_history_uses_empty_scoped_copy" -q`

Result:

- Ruff: passed
- Targeted backend tests: `3 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Method:

1. Two modes:
- `legacy`: emulate previous behavior by monkeypatching `_add_codegen_target_scoped_history_entry(...)` to call `add_new_history_entry(project_config_id=...)`.
- `scoped`: current behavior.
2. Warmup/measured iterations: `3` warmup + `12` measured.
3. Metrics:
- Direct history-copy micro-benchmark (`_add_codegen_target_scoped_history_entry(...)` call time)
- Route ACK latency (`route(...)` + `finish_pending_operations(...)`) for:
  - `set_project_config_codegen_targets`
  - `compare_and_set_python_codegen_enabled`

## Results (local)

| Area | Metric | Legacy | Scoped | Delta |
| --- | --- | ---: | ---: | ---: |
| Direct history copy | median | 49.45 ms | 3.32 ms | +93.28% faster |
| Direct history copy | p95 | 186.80 ms | 3.85 ms | +97.94% faster |
| `set_project_config_codegen_targets` ACK | median | 225.01 ms | 171.40 ms | +23.83% faster |
| `set_project_config_codegen_targets` ACK | p95 | 376.90 ms | 468.04 ms | -24.18% |
| `compare_and_set_python_codegen_enabled` ACK | median | 182.04 ms | 113.90 ms | +37.43% faster |
| `compare_and_set_python_codegen_enabled` ACK | p95 | 326.40 ms | 268.29 ms | +17.80% faster |

## Notes

- Median ACK latency improved materially for both routes, with strongest gain on `compare_and_set_python_codegen_enabled`.
- `set_project_config_codegen_targets` p95 remains noisy in local runs, but median and direct-history costs improved significantly.
