# set_param_entered_value incremental codegen fast path

Date: 2026-03-01
Area: backend
Branch/Commit: backend-performance @ ad0a39b2 (+ working tree)
Related PR: n/a

## Goal

Cut latency on typing-heavy backend updates by avoiding full `DependencyGraph` rebuilds when `set_param_entered_value` changes only a parameter value.

Touched code paths:
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_set_param_entered_value_ux.py`

## Scenario

- Entry point (URL/route/screen): backend route handler `set_param_entered_value`
- Steps to reproduce (keep deterministic):
  1. Create callable project state with 500 params.
  2. Run warmup writes.
  3. Measure 20 `set_param_entered_value` writes on the same param.
- Data set / project used: synthetic callable state from `build_callable_project_state(500)`.
- Browser + OS: n/a (backend-only), macOS.
- Notes (extensions, throttling, dev/prod build, etc):
  - Python env via `source activate.sh`.
  - Bench commands run locally in same worktree/session as implementation.

## Before (baseline)

- Measurement method (DevTools panels used, settings): backend micro-benchmark from investigation notes in `docs/plans/backend-performance-plan.md`.
- Key metrics:
  - `set_param_entered_value` end-to-end (autosave off): `~2356 ms/op`.
  - `DependencyGraph(project_state)` rebuild component: `~858 ms/op`.
- Observations:
  - Route paid full `_refresh_codegen_state` cost on each value edit.

## After

- Key metrics:
  - `set_param_entered_value` end-to-end median: `70.03 ms/op` (min `69.13`, max `165.0`) on 500 params.
  - Existing codegen benchmark guardrail (unchanged command):
    - `codegen.generate_code`: `1.71 ms/iter`
    - `codegen.change_value`: `1.72 ms/iter`
    - `codegen.process_gen_code_diagnostics`: `0.27 ms/iter`
- Observations:
  - Fast path now reuses `code_generator.change_value(...)` when invariants hold.
  - Fallback to full refresh remains for non-incremental conditions (for example python codegen disabled).
  - Updated tests confirm incremental output matches a forced full refresh output.

## Conclusion

- What improved:
  - Typing-path backend latency dropped substantially versus the previous measured baseline for this route.
  - Watcher refresh remains skipped for this route, and now full codegen rebuild is also skipped on the common path.
- What regressed (if any) + why it is acceptable:
  - No functional regressions observed in targeted backend tests.
- Follow-ups:
  1. Phase 4: pre-serialize websocket payloads once per broadcast.
  2. Phase 4: add revision-keyed single-config conversion cache.

## Raw Artifacts (local-only)

- No trace artifact files recorded for this backend-only run.

## Automated Perf Tests

(Optional but preferred: link automated guardrails added/updated as part of the work.)

- Playwright spec(s): n/a
- Vitest test(s) / bench(es): n/a
- Budgets/assertions added:
  - `tests/project_state/test_set_param_entered_value_ux.py::test_set_param_entered_value_skips_file_watcher_refresh_calls`
  - `tests/project_state/test_set_param_entered_value_ux.py::test_set_param_entered_value_incremental_codegen_matches_full_refresh_output`
  - `tests/project_state/test_set_param_entered_value_ux.py::test_set_param_entered_value_falls_back_to_full_refresh_without_python_codegen`
