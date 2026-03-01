# Param name validation read-path fast path

Date: 2026-03-02
Area: backend
Branch/Commit: backend-performance @ working tree
Related PR: n/a

## Goal

Eliminate deep-copy effective-impl overhead in param name validation to reduce end-to-end update latency on large projects.

Touched code paths:
- `backend/setta/types/helpers_lvl1.py`
- `backend/setta/utils/name_validation.py`
- `tests/types/test_helpers_lvl1.py`
- `tests/utils/test_name_validation.py`

## Scenario

- Entry points:
  - `collect_param_name_errors(...)`
  - `BaseProjectManager.update_and_broadcast_project_state(...)`
- Data set:
  - `build_callable_project_state(500)`
  - `build_callable_project_state(1000)`
- Environment:
  - local dev machine, Python env active via `source activate.sh`

## Before (baseline)

Baseline values captured in this branch after dependency-graph optimization and before this change:

- `collect_param_name_errors(1000)` median: `11117.473 ms`
- `_refresh_codegen_state(1000)` median: `67.400 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `297.357 ms`
- `update_and_broadcast_project_state(1000)` median: `22057.953 ms`

## After

- `collect_param_name_errors(500)` median: `9.531 ms`
- `collect_param_name_errors(1000)` median: `18.041 ms` (separate run)
- `collect_param_name_errors(1000)` median: `21.125 ms` (manager benchmark run)
- `_refresh_codegen_state(1000)` median: `69.334 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `255.069 ms`
- `update_and_broadcast_project_state(1000)` median: `4055.948 ms`

## What changed

- Added read-focused section helper:
  - `get_curr_effective_section_impl_for_read(...)`
  - `get_curr_effective_section_impl_for_read_with_type_guard(...)`
- Kept fallback semantics explicit:
  - If section/code-obj modifiers are present, still materialize effective impls.
  - If modifiers are absent, reuse base impl objects directly.
- Refactored param-name format validation internals:
  - Introduced `_param_name_format_error_for_context(...)` for pre-resolved context.
  - Reused section-level context (`section_is_dict`, dict root id, python codegen enabled) instead of recomputing per param.
  - Switched `collect_param_name_errors(...)` to read-path helpers for code obj impl resolution.

## Conclusion

- What improved:
  - Param-name validation dropped from multi-second to low-millisecond range on 500/1000 param states.
  - End-to-end full update with name-validation broadcast improved from ~22.1s to ~4.1s on the 1000-param benchmark.
- Residual bottleneck:
  - `update_and_broadcast_project_state(1000)` remains substantially slower than the no-name-validation path, indicating additional name-validation work outside param formatting is still significant.

## Automated Tests

- `./scripts/run_backend_tests.sh tests/types/test_helpers_lvl1.py tests/utils/test_name_validation.py tests/code_gen/test_dependency_graph_chat.py -q` (pass)
- `ruff check backend/setta/types/helpers_lvl1.py backend/setta/utils/name_validation.py tests/types/test_helpers_lvl1.py tests/utils/test_name_validation.py` (pass)
- `ruff format --check backend/setta/types/helpers_lvl1.py backend/setta/utils/name_validation.py tests/types/test_helpers_lvl1.py tests/utils/test_name_validation.py` (pass)

## Raw Artifacts (local-only)

- No trace artifacts recorded for this backend-only change.
