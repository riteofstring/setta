# set_param_entered_value validation fast path

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ e1fa6cd2 (+ working tree)

## Goal

Reduce per-edit validation overhead in the hot `set_param_entered_value` path by
replacing full `validate_for_update(...)` recomputation with a deterministic
non-structural param-value validation check.

Touched code paths:
- `backend/setta/types/project_state.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_set_param_entered_value_ux.py`

## Scenario

- Benchmark target:
  - `ProjectStateSingleConfig.validate_for_update(validate_code_file_bindings=True, validate_name_rules=False)`
  - `ProjectStateSingleConfig.validate_for_param_value_update(section_id, param_id)`
- Dataset:
  - `build_callable_project_state(1000)`
  - measured param: `section-1:param-0`
- Method:
  1. Build one baseline state and set a sample param value.
  2. For each iteration, deep-copy state outside timer.
  3. Time only the validation call.
  4. 8 warmup iterations, 120 measured iterations.
- Environment:
  - `source activate.sh && python - <<'PY' ...`

## Before (baseline)

- Full validation per param edit:
  - median: `28.3154 ms`
  - p95: `30.4505 ms`

## After

- Param-value-specific validation:
  - median: `0.0107 ms`
  - p95: `0.0141 ms`

## Conclusion

- Median validation cost for this mutation class dropped by roughly `2634x`.
- Behavior remains parity-checked:
  - fast path avoids `validate_for_update` in `set_param_entered_value`
  - derived-state parity vs full validation is covered in tests.

## Automated Coverage

- `tests/project_state/test_set_param_entered_value_ux.py::test_set_param_entered_value_skips_full_validate_for_update`
- `tests/project_state/test_set_param_entered_value_ux.py::test_set_param_entered_value_fast_validation_matches_full_validation`
