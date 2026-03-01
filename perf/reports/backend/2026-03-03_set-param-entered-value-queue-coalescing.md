# set_param_entered_value queue coalescing

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce head-of-line queue latency for high-frequency param value edits by
coalescing queued `set_param_entered_value` updates for the same param key into
last-write-wins execution.

## Change

- Extended queue enqueue plumbing to support optional coalescing keys for
  serialized handlers.
- Added coalesced queue work-item semantics:
  - replace queued coroutine with the newest request for the same key
  - retain all waiting futures for coalesced callers
  - retain all frontend op ids and mark them completed on the resulting patch
    broadcast
- Enabled coalescing for `set_param_entered_value` keyed by:
  - `projectConfigId + sectionId + paramInfoId`
- Added tests in:
  - `tests/project_state/test_param_value_queue_coalescing.py`
  - verifies same-key coalescing, different-key non-coalescing, completion ids,
    and queue call-count behavior

## Validation

- Backend:
  - `source activate.sh && pytest tests/project_state/test_param_value_queue_coalescing.py tests/project_state/test_enqueue_method.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_completion_queue_concurrency.py`
  - `source activate.sh && pytest tests/project_state/test_project_config_view_modes.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_listener_emit_updates.py tests/project_state/test_queue_cancellation.py tests/project_state/test_manual_save_queue.py`
  - Result: `24 passed` + `53 passed`.
- Frontend:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/websocketReceive.test.ts`
  - Result: `59 passed`.

## Benchmark scenario

Same harness as prior phase-0 report:
- synthetic callable project state with `1000` params
- one connected frontend websocket
- route under test: `set_param_entered_value`
- 80 requests in:
  - sequential mode (await each)
  - bursty mode (`asyncio.create_task`, batched submission)

## Results (local)

Comparison baseline: post pending-op-id payload compaction
(`2026-03-03_pending-op-ids-payload-compaction.md`).

| Metric (bursty) | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Wall ms/request | 80.57 ms | 2.53 ms | -96.86% |
| Queue handler calls | 80 | 3 | -96.25% |
| Queue wait avg | 2957.91 ms | 0.47 ms | -99.98% |
| Queue wait max | 6236.57 ms | 0.71 ms | -99.99% |
| Payload messages | 160 | 6 | -96.25% |
| Total payload bytes | 123,415 B | 5,364 B | -95.65% |

| Metric (sequential) | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Wall ms/request | 86.96 ms | 73.77 ms | +15.16% faster |
| Queue handler calls | 80 | 80 | unchanged |
| Total payload bytes | 123,255 B | 122,855 B | -0.32% |

## Notes

- Coalescing is intentionally scoped to same-param value edits; distinct params
  keep independent queue entries.
- Bursty improvements come from collapsing intermediate writes that would be
  overwritten before execution anyway.
- This does not solve general queue contention for unrelated write classes;
  queue partitioning remains relevant for multi-key/multi-route concurrency.
