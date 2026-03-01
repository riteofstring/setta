# deferred refresh stage-B patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Eliminate full `UpdateFrontendProjectState` snapshot broadcasts from deferred
stage-B refresh flows by using revisioned patch transport.

Targeted paths:
- `_refresh_deferred_codegen_now(...)`
- `_refresh_gen_code_prefix_suffix_now(...)`

## Change

Backend:
- Added `_run_deferred_codegen_refresh_with_patch_transport(...)`.
- Deferred refresh now applies this transport policy:
  - If active codegen singleton sections exist, emit section-impl patch transport
    for those singleton sections.
  - Otherwise emit project-config patch transport.
- Removed direct stage-B snapshot broadcast calls from:
  - `_refresh_deferred_codegen_now(...)`
  - `_refresh_gen_code_prefix_suffix_now(...)`

Tests:
- Added backend coverage to assert deferred flushes no longer use snapshot
  transport:
  - `test_flush_pending_task_board_deferred_refresh_uses_patch_transport`
  - `test_flush_pending_gen_code_prefix_refresh_uses_patch_transport`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_task_board_deferred_refresh.py tests/project_state/test_gen_code_prefix_suffix_deferred_refresh.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_task_board_deferred_refresh.py tests/project_state/test_gen_code_prefix_suffix_deferred_refresh.py tests/project_state/test_patch_transport_additional_routes.py`

Result:
- Backend: 9 passed.

## Benchmark scenario

Routes benchmarked:
- `set_task_board_section_state` (deferred codegen refresh path)
- `set_gen_code_prefix` (deferred gen prefix/suffix refresh path)

Method:
1. `real_settings_manager()` with autosave disabled.
2. Synthetic callable state via `build_callable_project_state(1000)`.
3. Measured 5 warmup + 25 iterations per route/mode.
4. For each iteration:
  - Stage A: invoke route and measure ACK latency (`route(...)` +
    `finish_pending_operations`).
  - Stage B: force deferred flush and measure flush latency + transport bytes.
5. Captured serialized websocket bytes for transport messages:
  - `UpdateFrontendProjectState`
  - `PatchFrontendProjectStateProjectConfig`
  - `PatchFrontendProjectStateSectionImpl`
  - `PatchFrontendProjectStateCodeObjs`

Modes:
- `legacy_snapshot`: monkeypatch deferred stage-B helper to old behavior
  (`update(...)` + `_broadcast_project_state_snapshot(...)`).
- `patched`: native stage-B patch transport behavior.

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_task_board_section_state` | ACK latency median | 107.6756 ms | 113.1404 ms | -5.08% |
| `set_task_board_section_state` | ACK latency p95 | 209.8592 ms | 220.6539 ms | -5.14% |
| `set_task_board_section_state` | stage-B flush latency median | 155.3603 ms | 161.4115 ms | -3.89% |
| `set_task_board_section_state` | stage-B flush latency p95 | 256.8494 ms | 265.9756 ms | -3.55% |
| `set_task_board_section_state` | stage-B payload median | 761228 B | 4149 B | -99.45% |
| `set_task_board_section_state` | stage-B payload p95 | 761228 B | 4149 B | -99.45% |
| `set_gen_code_prefix` | ACK latency median | 50.0179 ms | 48.3596 ms | +3.32% faster |
| `set_gen_code_prefix` | ACK latency p95 | 152.4254 ms | 148.9574 ms | +2.28% faster |
| `set_gen_code_prefix` | stage-B flush latency median | 155.7449 ms | 144.6504 ms | +7.12% faster |
| `set_gen_code_prefix` | stage-B flush latency p95 | 267.6012 ms | 251.0143 ms | +6.20% faster |
| `set_gen_code_prefix` | stage-B payload median | 759209 B | 3873 B | -99.49% |
| `set_gen_code_prefix` | stage-B payload p95 | 759209 B | 3873 B | -99.49% |

## Notes

- In this synthetic setup, stage-B patch messages resolved to
  `PatchFrontendProjectStateProjectConfig` (no active codegen singleton sections
  in benchmark state).
- Main win is stage-B transport size reduction (`~183x` to `~196x` smaller)
  while preserving deferred-refresh semantics.
- Latency impact is mixed/noisy across routes; this tranche primarily removes
  deferred snapshot transport overhead.
