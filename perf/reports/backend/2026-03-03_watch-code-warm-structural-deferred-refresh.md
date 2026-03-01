# Watch-code warm structural deferred refresh

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Remove the remaining synchronous `_refresh_codegen_state(...)` cost from warm
watch-code structural update ACK paths by preparing existing `gen_code` state
incrementally instead of rebuilding codegen state in stage-A.

## Change

`backend/setta/project_state/watch_code.py`:

- Added incremental prep helper:
  - `_prepare_gen_code_for_callable_updates(...)`
- Added targeted dep-key export helper:
  - `_try_export_missing_section_dep_key(...)`
- Updated `_update_sections_for_callables(...)` to:
  - Sync `gen_code` prefix inline when watch-code imports mutate `genCodePrefix`.
  - Incrementally export missing section dependency keys into the existing
    dependency graph for affected callable sections.
  - Fall back to full synchronous refresh only if required keys are still missing
    after incremental prep.

Behavioral result for warm paths:
- Structural watch-code updates now ACK without synchronous full refresh.
- Existing deferred stage-B refresh scheduling remains unchanged.

## Test coverage updates

`tests/project_state/test_watch_code.py`:
- Updated `test_watch_code_structural_update_defers_codegen_refresh` to warm
  gen-code first and assert structural updates defer refresh on warm state.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/watch_code.py tests/project_state/test_watch_code.py`
- `source activate.sh && ruff format --check backend/setta/project_state/watch_code.py tests/project_state/test_watch_code.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_watch_code.py -q`

Result:
- Ruff checks passed.
- Backend tests: `27 passed`.

## Benchmark scenario

Synthetic warm watch-code structural update benchmark.

Method:
1. `real_project_manager()` fixture with autosave disabled defaults.
2. Configure watch-code inputs on one tracked python file and enable watch-code.
3. Warm once to initialize `gen_code`.
4. Compare two modes over alternating structural add/remove updates (`3` warmup + `14` measured):
   - `legacy_sync` (emulated): monkeypatch
     `_prepare_gen_code_for_callable_updates(...)` to no-op so update path falls
     back to synchronous refresh.
   - `patched`: native incremental prep behavior.
5. During timed ACK window, defer stage-B by monkeypatching
   `_schedule_deferred_codegen_refresh(...)` to mark pending revision only, then
   flush deferred refresh outside timing via `_flush_pending_deferred_codegen_refresh(...)`.
6. Metrics:
   - ACK latency: `apply_watch_code_file_update(...)` +
     `finish_pending_operations(...)`.
   - Synchronous refresh count per operation (`_refresh_codegen_state` calls in
     ACK window).

## Results (local)

| Metric | Legacy Sync | Patched | Delta |
| --- | ---: | ---: | ---: |
| ACK latency median | 3.4342 ms | 2.8214 ms | +17.84% faster |
| ACK latency p95 | 4.3813 ms | 3.1712 ms | +27.62% faster |
| Sync refresh calls (total, 14 ops) | 14 | 0 | -100% |
| Sync refresh per op (median) | 1.0 | 0.0 | -100% |
| Sync refresh per op (p95) | 1.0 | 0.0 | -100% |

## Notes

- This optimization targets warm paths where `gen_code` is already initialized.
- Cold-start watch-code structural updates can still require one synchronous
  bootstrap refresh when no `gen_code` instance exists yet.
