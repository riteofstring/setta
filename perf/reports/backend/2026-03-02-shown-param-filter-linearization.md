# shownParamIds linear filter optimization

Date: 2026-03-02
Area: backend
Branch/Commit: backend-performance @ working tree
Related PR: n/a

## Goal

Reduce `validate_shown_param_ids(...)` cost by replacing recursive/quadratic candidate inclusion checks with linear-time map-based passes.

Touched code paths:
- `backend/setta/types/shown_params.py`
- `tests/types/test_shown_params.py`

## Scenario

- Entry points:
  - `ProjectStateSingleConfig.validate_shown_param_ids(...)`
  - `ProjectStateSingleConfig.validate_for_update(...)`
  - `BaseProjectManager.update(...)`
- Data set:
  - `build_callable_project_state(1000)`
- Environment:
  - local dev machine, Python env active via `source activate.sh`

## Before (baseline)

Baseline values captured in this branch before this change:

- `validate_shown_param_ids(1000)` median: `65.548 ms`
- `update(validate_name_rules=False, updateFileWatcher=True)` median: `170.657 ms`
- `update(validate_name_rules=False, updateFileWatcher=False)` median: `143.152 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `170.551 ms`
- `update_and_broadcast_project_state(1000)` median: `196.580 ms`

## After

- `validate_shown_param_ids(1000)` median: `14.556 ms`
- `validate_for_update_no_name_rules(1000)` median: `29.332 ms`
- `update(validate_name_rules=False, updateFileWatcher=True)` median: `135.944 ms`
- `update(validate_name_rules=False, updateFileWatcher=False)` median: `107.613 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `145.277 ms`
- `update_and_broadcast_project_state(1000)` median: `160.855 ms`

## What changed

- Replaced recursive include checks in shown-param filtering with linear precomputed maps:
  - parent map via one pass over `children_map`
  - bottom-up candidate inclusion propagation without recursive `any(...)` scans
- Replaced O(n^2) top-level parent detection (`any(...)` over included params) with direct parent-map lookups.
- Updated descendant expansion to iterative traversal with visited-set short-circuiting.
- Added focused regression tests for pinned/unpinned path semantics and pruning behavior.

## Conclusion

- What improved:
  - `validate_shown_param_ids(1000)` reduced by ~78%.
  - End-to-end update/broadcast latency improved further on the same 1000-param state.
- Why this is high-impact:
  - This was the largest remaining validation hotspot after earlier backend optimizations.

## Automated Tests

- `./scripts/run_backend_tests.sh tests/types/test_shown_params.py tests/types/test_helpers_lvl2.py -q` (pass)
- `ruff check backend/setta/types/shown_params.py tests/types/test_shown_params.py` (pass)
- `ruff format --check backend/setta/types/shown_params.py tests/types/test_shown_params.py` (pass)

## Raw Artifacts (local-only)

Benchmark outputs were captured from local ad-hoc scripts run in this workspace.
