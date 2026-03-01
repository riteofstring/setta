# save worker deferred payload materialization

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ bcc4eb29 (baseline emulation) -> working tree

## Goal

Reduce save enqueue latency by removing deep save-payload copies from
`_queue_save_for_current_revision` hot path.

## Change

Backend changes in `SessionProjectManager`:
- `_build_save_work_item(...)` now captures only lightweight save metadata and a
  source backend reference.
- Deep payload materialization moved to worker-thread stage via
  `_resolve_save_work_item_payload(...)` right before persistence.
- `_save_worker_loop(...)` now resolves payload then persists.
- Added guardrail error if `_persist_save_work_item(...)` is reached without a
  prepared payload.

Behavioral guardrails:
- Added tests:
  - `test_build_save_work_item_defers_payload_materialization`
  - `test_autosave_resolves_payload_in_save_worker_thread`
- Existing save-worker/manual-save tests continue to pass.

## Benchmark scenario

Representative perf target: save enqueue path for `SessionPersistenceMode.ide_main`
on a 1000-param synthetic project state.

Method:
1. Use `real_project_manager()` with autosave disabled.
2. Build callable project state with 1000 params.
3. Compare:
   - baseline emulation: old `_build_save_work_item(...)` behavior
     (`model_copy(deep=True)` payload in enqueue path)
   - after: new `_build_save_work_item(...)` (payload deferred to worker)
4. Collect 60 measured iterations (5 warmup) for
   `_queue_save_for_current_revision()` with worker startup disabled to isolate
   enqueue cost.

Secondary measurement:
- Direct `_build_save_work_item(...)` call cost under baseline emulation vs
  after (40 measured iterations, 5 warmup).

## Results (local)

`_queue_save_for_current_revision()` enqueue latency:

- baseline median: `39.9983 ms`
- after median: `0.3299 ms`
- median improvement: `~99.18%`

- baseline p95: `44.0460 ms`
- after p95: `0.3806 ms`
- p95 improvement: `~99.14%`

`_build_save_work_item(...)` construction latency:

- baseline median: `42.6386 ms`
- after median: `0.2007 ms`
- median improvement: `~99.53%`

- baseline p95: `132.0218 ms`
- after p95: `0.2061 ms`
- p95 improvement: `~99.84%`

## Coverage

Backend tests:
- `tests/project_state/test_manual_save_queue.py`
- `tests/project_state/test_manual_save_autosave.py`
- `tests/project_state/test_settings_project_json_source_load.py`
- `tests/project_state/test_autosave_cancellation.py`
