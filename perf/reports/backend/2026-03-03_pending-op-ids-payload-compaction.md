# Pending op-id payload compaction for patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce websocket patch payload inflation under queue backlog by removing
high-cardinality `pendingOpIds` arrays from every patch message while keeping
`completedOpIds` reconciliation intact.

## Change

- Updated `BaseProjectManager._consume_frontend_op_status_for_broadcast(...)` to:
  - keep `completed_op_ids` behavior unchanged
  - emit `pending_op_ids=[]` for transport payloads
- Internal manager tracking still keeps `pending_frontend_ops` unchanged for queue
  lifecycle and `finish_pending_operations(...)`.
- Added regression coverage in `tests/project_state/test_enqueue_method.py`:
  - `test_broadcast_status_omits_pending_op_ids_payload`

## Validation

- Backend:
  - `source activate.sh && pytest tests/project_state/test_enqueue_method.py tests/project_state/test_completion_queue_concurrency.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_project_config_view_modes.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_listener_emit_updates.py`
  - Result: `65 passed`.
- Frontend:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/websocketReceive.test.ts`
  - Result: `59 passed`.

## Benchmark scenario

Same harness as `2026-03-03_phase0-queue-and-websocket-metrics-baseline.md`:
- route: `set_param_entered_value`
- state: synthetic callable project with `1000` params
- one connected frontend websocket
- `80` writes in:
  - sequential mode
  - bursty concurrent mode (queue backlog)

## Results (local)

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Bursty payload avg bytes/msg (all patch msgs) | 1153.33 B | 771.34 B | -33.12% |
| Bursty `PatchFrontendProjectStateCodeObjs` avg bytes/msg | 1325.24 B | 944.71 B | -28.71% |
| Bursty `PatchFrontendProjectStateSectionImpl` avg bytes/msg | 981.43 B | 597.98 B | -39.07% |
| Bursty total payload bytes (160 msgs) | 184,533 B | 123,415 B | -33.12% |

| Inflation check | Before | After |
| --- | ---: | ---: |
| Bursty vs sequential payload avg bytes/msg | +49.62% | +0.13% |

| Queue metric (bursty) | Before | After |
| --- | ---: | ---: |
| Queue wait avg | 2778.07 ms | 2957.91 ms |
| Execute avg | 72.54 ms | 80.56 ms |

## Notes

- This change specifically targets transport size; it does not reduce queue
  contention or per-op execution cost.
- Queue wait remains the dominant latency source under bursty submissions, which
  keeps queue-partition/decongestion work as the next major optimization path.
