# code-obj patch deferred refresh rollout

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce ACK latency for high-frequency code-obj + section patch routes by moving
`_refresh_codegen_state(...)` off the ACK path while keeping revisioned patch
transport and eventual consistency guarantees.

## Change

`backend/setta/project_state/base_project_manager.py`:

- Added shared patch payload broadcaster:
  - `_broadcast_code_obj_and_section_patch_payloads(...)`
- Refactored existing synchronous helper to use it:
  - `_update_and_broadcast_code_obj_and_section_patches(...)`
- Added deferred stage-A helper:
  - `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`
  - Validates + merges canonical state without immediate codegen refresh.
  - Emits the same patch message shapes on ACK.
  - Schedules stage-B codegen refresh via `_schedule_deferred_codegen_refresh(...)`.

Converted routes to deferred helper:

- `set_param_name_and_value(...)`
- `set_code_obj_name(...)`
- `set_section_edge_inputs(...)`
- `set_section_edge_outputs(...)`
- `create_edge(...)`
- `update_edge(...)`
- `delete_edges(...)`
- `reconnect_edge(...)`
- `set_edges(...)`
- `create_agentic_edge(...)`
- `update_agentic_edge(...)`
- `delete_agentic_edges(...)`
- `set_agentic_edges(...)`
- `apply_listener_emit_updates(...)` (dependency-update path)

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_edge_patch_transport.py tests/project_state/test_listener_emit_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_name_value_ux.py tests/project_state/test_edge_patch_transport.py tests/project_state/test_listener_emit_patch_transport.py -q`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_edge_patch_transport.py tests/project_state/test_listener_emit_patch_transport.py -q`

Result:

- `41 passed` across selected suites.

## Benchmark scenario

Synthetic callable state (`1000` params) with additional edge source/target
sections and one initialized edge.

Routes benchmarked:

- `set_param_name_and_value`
- `set_section_edge_outputs`
- `apply_listener_emit_updates` (section-param dependency update)

Method:

1. Compare two modes:
   - `legacy_sync` (emulated): monkeypatch
     `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`
     to call the old synchronous helper
     `_update_and_broadcast_code_obj_and_section_patches(...)`.
   - `patched`: native deferred helper behavior.
2. For each sample:
   - Measure ACK latency as `route(...) + finish_pending_operations(...)`.
   - Measure eventual latency as `route(...)` + forced stage-B flush via
     `_flush_pending_deferred_codegen_refresh(...)`.
3. Reset state each sample via `undo(steps=1)`.
4. Warmup/measured: `3` warmup + `12` measured.

## Results (local)

| Route | Metric | Legacy Sync | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_param_name_and_value` | ACK median | 205.1366 ms | 133.4576 ms | +34.94% faster |
| `set_param_name_and_value` | ACK p95 | 300.7931 ms | 147.5047 ms | +50.96% faster |
| `set_param_name_and_value` | eventual (forced flush) median | 205.1372 ms | 290.0784 ms | -41.41% |
| `set_param_name_and_value` | eventual (forced flush) p95 | 300.7937 ms | 386.2020 ms | -28.39% |
| `set_section_edge_outputs` | ACK median | 169.1961 ms | 104.2741 ms | +38.37% faster |
| `set_section_edge_outputs` | ACK p95 | 278.4019 ms | 245.3177 ms | +11.88% faster |
| `set_section_edge_outputs` | eventual (forced flush) median | 169.1966 ms | 251.1653 ms | -48.45% |
| `set_section_edge_outputs` | eventual (forced flush) p95 | 278.4026 ms | 407.3295 ms | -46.31% |
| `apply_listener_emit_updates` | ACK median | 181.4250 ms | 112.0136 ms | +38.26% faster |
| `apply_listener_emit_updates` | ACK p95 | 286.2063 ms | 116.1034 ms | +59.43% faster |
| `apply_listener_emit_updates` | eventual (forced flush) median | 181.4256 ms | 259.9006 ms | -43.25% |
| `apply_listener_emit_updates` | eventual (forced flush) p95 | 286.2068 ms | 356.0658 ms | -24.41% |

## Notes

- ACK-path latency improved materially (`~35-59%`) for the converted route
  sample.
- As expected, forcing stage-B completion in-line increases eventual
  route+flush timing because refresh work is now explicitly deferred.
- `create_run_command(...)` already flushes pending deferred refreshes before
  constructing run payloads, preserving run correctness.
