# Phase 2: `format_code` Watcher Refresh Skip

## Scope
- Route: `format_code` in `BaseProjectManager`.
- Change: keep full update/codegen behavior, but pass `updateFileWatcher=False` so watcher callbacks are not re-registered on formatting-only edits.
- Paths covered:
  - Python code section formatting branch.
  - Generated Python prefix/suffix formatting branch.

## Benchmark Setup
- Environment: local dev machine, same shell/session.
- Project shape: `build_callable_project_state(300)` with added top-level `Code` and `GenPythonCode` sections.
- Measurement: wall-clock around route call + `finish_pending_operations()`.
- Warmup: 1 iteration.
- Measured iterations: 5 iterations.

## Baseline Method
- Baseline was simulated in-process by forcing `_update_and_broadcast_project_state_no_name_validation(..., updateFileWatcher=True)` during `format_code`.
- This mirrors pre-change watcher behavior while keeping the same runtime, state shape, and test harness.

## Results

| Route case | Simulated before median (ms) | Optimized after median (ms) | Delta (ms) | Delta (%) |
| --- | ---: | ---: | ---: | ---: |
| `format_code` on Python `CodeSectionImpl` | 469.88 | 386.43 | -83.45 | -17.76% |
| `format_code` on `GenPythonCodeSectionImpl` | 490.07 | 404.96 | -85.11 | -17.37% |

## Notes
- Both format paths show similar reduction (~17-18% median).
- Behavior-preservation and optimization-specific checks are covered in `tests/project_state/test_format_code.py`.
