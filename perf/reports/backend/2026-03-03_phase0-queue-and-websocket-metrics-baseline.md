# Phase 0 queue and websocket metrics baseline

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ 45e1ee329 + working tree

## Goal

Capture first baseline numbers using the new Phase-0 instrumentation counters:
- queue wait vs execute timing in `BaseProjectManager`
- websocket payload-byte and transport-byte stats by `messageType`

This establishes where head-of-line blocking and payload inflation remain, before
starting queue-partition work.

## Change

- Added queue timing counters in `BaseProjectManager`:
  - `queueWaitSeconds`, `executeSeconds`, `endToEndSeconds`
  - aggregate totals + per-handler rollups
  - `get_queue_timing_metrics_snapshot()` and `reset_queue_timing_metrics()`
- Added websocket payload counters in `WebsocketManager`:
  - payload bytes + fanout transport bytes
  - aggregate totals + per-message-type rollups
  - `get_payload_metrics_snapshot()` and `reset_payload_metrics()`
- Added focused tests for metric accounting and teardown compatibility updates.

## Validation

- `source activate.sh && pytest tests/project_state/test_completion_queue_concurrency.py tests/project_state/test_manual_save_queue.py tests/project_state/test_enqueue_method.py tests/project_state/test_queue_cancellation.py tests/websockets/test_websocket_manager_sessions.py`
- Result: `37 passed`.

## Benchmark scenario

Synthetic route benchmark using `real_settings_manager()`:
1. Build callable project state with `1000` params and load via `manager.update(...)`.
2. Connect one frontend websocket sink.
3. Warm up `set_param_entered_value`.
4. Reset queue/payload counters.
5. Run `80` `set_param_entered_value` writes in two modes:
   - `sequential`: await each request before sending next.
   - `bursty`: submit in small concurrent bursts (`asyncio.create_task`) to create queue contention.
6. Read snapshots from:
   - `manager.get_queue_timing_metrics_snapshot()`
   - `websocket_manager.get_payload_metrics_snapshot()`

## Results (local)

| Mode | Requests | Wall ms/request | Queue wait avg | Queue wait max | Execute avg |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sequential | 80 | 72.45 ms | 0.018 ms | 0.024 ms | 72.40 ms |
| Bursty | 80 | 72.54 ms | 2778.07 ms | 5615.96 ms | 72.54 ms |

| Metric | Sequential | Bursty | Delta |
| --- | ---: | ---: | ---: |
| Payload avg bytes/msg (all patch msgs) | 770.84 B | 1153.33 B | +49.62% |
| `PatchFrontendProjectStateCodeObjs` avg bytes/msg | 943.71 B | 1325.24 B | +40.43% |
| `PatchFrontendProjectStateSectionImpl` avg bytes/msg | 597.97 B | 981.43 B | +64.12% |
| Total payload bytes (160 msgs) | 123,335 B | 184,533 B | +49.62% |

## Notes

- Per-request execution time stayed roughly flat (~72 ms), but bursty submissions
  produced very large queue waits (seconds), confirming queue head-of-line blocking.
- Bursty mode also inflated patch payload sizes because pending/completed op-id
  fields grew while the queue backed up.
- This supports the next optimization path in the roadmap:
  - queue partitioning / reduced contention
  - tighter pending/completed op metadata in high-backlog cases
