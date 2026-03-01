# Dependency graph read-helper fast path

Date: 2026-03-02
Area: backend
Branch/Commit: backend-performance @ working tree
Related PR: n/a

## Goal

Reduce `DependencyGraph` construction time by removing deep-copy effective-impl work from read-only param traversal.

Touched code paths:
- `backend/setta/types/helpers_lvl1.py`
- `backend/setta/code_gen/dependency_graph.py`
- `tests/types/test_helpers_lvl1.py`

## Scenario

- Entry points:
  - `DependencyGraph(project_state)`
  - `get_curr_effective_code_obj_impl_for_read_with_type_guard(...)` loop over params
- Data set:
  - `build_callable_project_state(500)`
  - `build_callable_project_state(1000)`
- Environment:
  - local dev machine, Python env active via `source activate.sh`

## Before (baseline)

- `DependencyGraph(500)` median: `864.778 ms`
- `DependencyGraph(1000)` median: `3585.265 ms`

Root-cause micro benchmark:
- Existing helper loop over params (`get_curr_effective_code_obj_impl_with_type_guard`):
  - 500 params: `846.084 ms`
  - 1000 params: `3510.910 ms`

## After

- `DependencyGraph(500)` median: `16.779 ms`
- `DependencyGraph(1000)` median: `33.717 ms`

Read-helper micro benchmark:
- New helper loop over params (`get_curr_effective_code_obj_impl_for_read_with_type_guard`):
  - 500 params: `0.487 ms`
  - 1000 params: `0.980 ms`

## Conclusion

- What improved:
  - `DependencyGraph` construction dropped by ~98%+ on 500/1000 param states.
  - The hot path now avoids repeated deep-copy effective impl materialization when section/code-obj modifiers are empty.
- Correctness guardrails:
  - New tests verify no-modifier fast path reuses base impl and modifier-present cases still materialize effective impl snapshots.
  - Existing dependency-graph tests remain green.

## Automated Tests

- `./scripts/run_backend_tests.sh tests/types/test_helpers_lvl1.py -q` (pass)
- `./scripts/run_backend_tests.sh tests/code_gen/test_code_generator_benchmark.py -q` (pass)
- `./scripts/run_backend_tests.sh tests/code_gen/test_dependency_graph_chat.py tests/code_gen/test_dependency_graph_draw.py tests/code_gen/test_dependency_graph_image.py tests/code_gen/test_dependency_graph_plugin.py tests/code_gen/test_meta_control_dependency_graph.py tests/code_gen/test_code_obj_value_policy_dependency_graph.py -q` (pass)

## Raw Artifacts (local-only)

- No trace artifacts recorded for this backend-only change.
