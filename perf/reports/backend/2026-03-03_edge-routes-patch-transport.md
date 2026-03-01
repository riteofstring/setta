# edge routes patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Replace full project-state snapshot transport on edge and agentic-edge mutation
routes with revisioned patch transport.

Routes converted in this tranche:
- `set_section_edge_inputs`
- `set_section_edge_outputs`
- `create_edge`
- `update_edge`
- `delete_edges`
- `reconnect_edge`
- `set_edges`
- `create_agentic_edge`
- `update_agentic_edge`
- `delete_agentic_edges`
- `set_agentic_edges`

## Change

Backend:
- Replaced `_update_and_broadcast_project_state_no_name_validation(...)`
  usage in all routes above with
  `_update_and_broadcast_code_obj_and_section_patches(...)`.
- New route-specific patch scoping:
  - `broadcast_project_config_patch=True` for all converted routes.
  - Targeted `code_obj_ids` for routes that mutate/clear edge target values.
  - `section_ids` scoped via
    `_build_section_patch_scope_with_codegen_singletons(...)` so codegen
    singleton sections stay synchronized when refresh mutates them.
- Preserved existing no-name-validation behavior (`validate_name_rules=False`,
  `broadcast_name_validation_errors=False`).

Tests:
- Added `tests/project_state/test_edge_patch_transport.py`:
  - `test_set_section_edge_input_and_output_routes_use_patch_transport`
  - `test_edge_routes_use_patch_transport`
  - `test_agentic_edge_routes_use_patch_transport`
- Existing edge behavior test still passes:
  - `tests/project_state/test_edge_output_reapply.py`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_edge_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_edge_patch_transport.py tests/project_state/test_edge_output_reapply.py`

Result:
- backend tests: `4 passed`

## Benchmark scenario

Representative route benchmarks on synthetic callable project state (`1000`
params) with added edge/agentic-edge setup:
- `set_section_edge_outputs` (edge-output edit path)
- `set_agentic_edges` (agentic edge list update path)

Method:
1. `real_settings_manager()` fixture, autosave disabled.
2. Build baseline with `build_callable_project_state(1000)`.
3. Add Dict source/target sections, edge ports/inputs, one data edge.
4. Add Chat + Dict sections and one agentic edge.
5. Two transport modes:
- `legacy_snapshot`: monkeypatch
  `_update_and_broadcast_code_obj_and_section_patches(...)` to call
  `_update_and_broadcast_project_state_no_name_validation(...)`.
- `patched`: native patch transport behavior.
6. 3 warmup + 12 measured iterations per route/mode.
7. Metrics per operation:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- Serialized websocket bytes for project-state transport message types only:
  - `WebsocketMsgUpdateFrontendProjectState`
  - `WebsocketMsgPatchFrontendProjectStateProjectConfig`
  - `WebsocketMsgPatchFrontendProjectStateCodeObjs`
  - `WebsocketMsgPatchFrontendProjectStateSectionImpl`

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_section_edge_outputs` | latency median | 184.0015 ms | 184.5636 ms | -0.31% |
| `set_section_edge_outputs` | latency p95 | 285.3000 ms | 306.0900 ms | -7.29% |
| `set_section_edge_outputs` | payload median | 769,302 B | 7,636 B | -99.01% |
| `set_section_edge_outputs` | payload p95 | 769,302 B | 7,636 B | -99.01% |
| `set_agentic_edges` | latency median | 293.5317 ms | 288.3863 ms | +1.75% faster |
| `set_agentic_edges` | latency p95 | 470.0394 ms | 563.2264 ms | -19.83% |
| `set_agentic_edges` | payload median | 769,449.5 B | 5,816.5 B | -99.24% |
| `set_agentic_edges` | payload p95 | 769,450 B | 5,817 B | -99.24% |

## Notes

- Payload-size reduction is very large for both representative routes
  (`~99%` smaller websocket project-state transport payloads).
- ACK latency is mixed in this local synthetic run; route wall time remains
  dominated by update/refresh compute and local variability.
- This tranche removes another high-volume class of full-snapshot broadcasts
  from interactive canvas routes.
