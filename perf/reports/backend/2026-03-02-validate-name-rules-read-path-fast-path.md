# validate_name_rules read-path fast path

Date: 2026-03-02
Area: backend
Branch/Commit: backend-performance @ working tree
Related PR: n/a

## Goal

Remove deep-copy effective-impl overhead from `ProjectStateSingleConfig.validate_name_rules(...)` by using read-path helpers.

Touched code paths:
- `backend/setta/types/project_state.py`
- `tests/utils/test_name_validation.py`

## Scenario

- Entry points:
  - `ProjectStateSingleConfig.validate_name_rules(...)`
  - `BaseProjectManager.update_and_broadcast_project_state(...)`
- Data set:
  - `build_callable_project_state(1000)`
- Environment:
  - local dev machine, Python env active via `source activate.sh`

## Before (baseline)

Baseline captured in this branch before this change (post previous optimization commit `78479534`):

- `validate_name_rules(1000)` median: `~3646 ms`
- `update_and_broadcast_project_state(1000)` median: `4055.948 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `255.069 ms`

## After

- `validate_name_rules(1000)` median: `3.912 ms`
- `collect_param_name_errors(1000)` median: `18.701 ms`
- `_refresh_codegen_state(1000)` median: `66.670 ms`
- `_update_and_broadcast_project_state_no_name_validation(1000)` median: `306.062 ms`
- `update_and_broadcast_project_state(1000)` median: `333.318 ms`

## What changed

- Switched name-rule validation to read-path impl resolution:
  - `get_curr_effective_section_impl_for_read(...)`
  - `get_curr_effective_code_obj_impl_for_read(...)`
- Kept behavior unchanged:
  - still validates section names and project name.
  - still validates callable and meta-control param names through `validate_param_name_format(...)`.
- Added direct regression coverage for `validate_name_rules(...)`:
  - invalid callable param name raises.
  - invalid meta-control param name raises.
  - `coreNameEditable=True` allows empty param names.

## Conclusion

- What improved:
  - `validate_name_rules(1000)` dropped from multi-second to single-digit millisecond time.
  - Full update path with name-validation broadcast is now near the no-name-validation path (`333 ms` vs `306 ms`).
- Why this is high-impact:
  - This removed the remaining dominant backend latency in update flows after prior name-validation optimizations.

## Automated Tests

- `./scripts/run_backend_tests.sh tests/utils/test_name_validation.py -q` (pass)
- `./scripts/run_backend_tests.sh tests/routers/test_name_validation_routes.py -q` (pass)
- `ruff check backend/setta/types/project_state.py tests/utils/test_name_validation.py` (pass)
- `ruff format --check backend/setta/types/project_state.py tests/utils/test_name_validation.py` (pass)

## Raw Artifacts (local-only)

Benchmark outputs were captured from a local ad-hoc script run in this workspace.
