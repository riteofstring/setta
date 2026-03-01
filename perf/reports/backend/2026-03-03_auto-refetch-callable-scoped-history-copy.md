# auto-refetch callable scoped history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce history snapshot overhead on `_refetch_callable_params(...)` by replacing
its remaining full project-config history copy with a tighter scoped copy.

## Change

Backend (`base_project_manager.py`):

- Updated `_refetch_callable_params(...)` history recording path to use scoped
  history arguments instead of full `project_config_id` copy.
- Scoped history now includes:
  - affected callable sections (`section_impl_only_ids`)
  - callable root code objects only (`code_obj_only_ids`)
  - codegen singleton sections (for deferred refresh stage-B correctness)
- Kept existing coalescing key/window behavior.

Tests:

- Added scoped-history assertion in
  `tests/project_state/test_auto_refetch_history.py`:
  - `test_auto_refetch_history_uses_scoped_copy`
  - validates the history call path uses scoped `section_impl_only_ids` and
    `code_obj_only_ids` for `autoRefetchCallable:*`.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_auto_refetch_history.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_auto_refetch_history.py tests/project_state/test_watch_code.py -k "auto_refetch or watch_code_signature_update_defers_codegen_refresh" -q`

Result:

- Ruff: passed
- Backend tests: `8 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Method:

1. Compare two modes:
   - `legacy`: emulate old behavior by stripping scoped args from the
     `autoRefetchCallable:*` `add_new_history_entry(...)` call.
   - `scoped`: current behavior.
2. Force non-coalesced samples for this route (set coalesce key/window to
   `None` in benchmark harness) so history copy work is measured each iteration.
3. Route benchmark:
   - `auto_refetch_callable_params`
   - `3` warmup + `12` measured iterations
   - ACK latency measured as route call + `finish_pending_operations(...)`
   - deferred refresh flushed outside timed window each iteration
4. Direct history-copy micro-benchmark:
   - `legacy`: `add_new_history_entry(project_config_id=...)`
   - `scoped`: section + callable-root scoped history entry
   - `3` warmup + `12` measured iterations

## Results (local)

| Area | Metric | Legacy | Scoped | Delta |
| --- | --- | ---: | ---: | ---: |
| Direct history copy | median | 50.45 ms | 12.08 ms | +76.06% faster |
| Direct history copy | p95 | 147.30 ms | 14.85 ms | +89.92% faster |
| `auto_refetch_callable_params` ACK | median | 239.25 ms | 189.16 ms | +20.93% faster |
| `auto_refetch_callable_params` ACK | p95 | 332.02 ms | 307.47 ms | +7.39% faster |

## Notes

- This path is invoked by both explicit auto-refetch and LSP mismatch refetch
  flows, including watch-code-driven signature refresh.
- First attempted scope (all callable section code objects) was too broad and
  expensive; using callable root IDs preserves correctness while keeping copy
  cost low.
