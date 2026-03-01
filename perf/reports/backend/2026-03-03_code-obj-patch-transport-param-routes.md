# code-obj patch transport for param mutation routes

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Replace remaining full project-state snapshot transport in high-traffic
code-object mutation routes with revisioned code-obj patch transport, while
still patching affected section impls when section-level UI data changes.

## Change

Backend:
- Added `ProjectStateCodeObjsPatch` and websocket message type
  `PatchFrontendProjectStateCodeObjs`.
- Added sender method `broadcast_project_state_code_objs_patch(...)`.
- Added `BaseProjectManager` helpers:
  - `_collect_code_obj_updates_for_patch(...)`
  - `_broadcast_code_objs_patch(...)`
  - `_update_and_broadcast_code_obj_and_section_patches(...)`
- Routed these writes away from full snapshot broadcasts:
  - `set_param_entered_value` (code-obj patch + section-impl patch scope)
  - `set_param_name_and_value` (code-obj patch + section-impl patch scope)
  - `set_code_obj_name` (code-obj patch + section-impl patch scope)
  - `set_code_obj_display_name` (code-obj patch only)

Frontend:
- Added code-obj patch receive path with revision mismatch resync:
  - `handleCodeObjsProjectStatePatch(...)`
  - `applyCodeObjsProjectStatePatch(...)`

Tests:
- Updated backend transport-shape assertions for the converted routes.
- Added backend coverage for display-name route transport:
  - `test_set_code_obj_display_name_uses_code_obj_patch_transport`
- Added frontend websocket + store patch-apply coverage for code-obj patches.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py backend/setta/project_state/project_manager_types.py backend/setta/types/websocket.py backend/setta/websockets/msg_handlers/frontend_sender.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_param_name_value_ux.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_value_edit_watcher_ux.py`
- `pnpm -C frontend gcf`
- `pnpm -C frontend exec vitest run src/state/actions/websocketReceive.test.ts src/state/actions/sectionInfos.test.ts`

Result:
- Backend: 32 passed.
- Frontend: 51 passed.

## Benchmark scenario

Routes benchmarked:
- `set_param_entered_value`
- `set_param_name_and_value`
- `set_code_obj_name`

Method:
1. `real_settings_manager()` with autosave disabled.
2. Synthetic callable project state via `build_callable_project_state(1000)`.
3. One run per route per mode with 5 warmup + 25 measured iterations.
4. Measured per-op ACK latency (`route(...)` + `finish_pending_operations`).
5. Captured serialized websocket bytes from project-state transport messages.

Modes:
- `legacy_snapshot`: monkeypatched converted helpers to broadcast
  `UpdateFrontendProjectState` snapshots (pre-change behavior).
- `patched`: native code-obj + section-impl patch transport.

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_param_entered_value` | latency median | 70.3299 ms | 69.7842 ms | +0.78% faster |
| `set_param_entered_value` | latency p95 | 168.6200 ms | 185.9441 ms | -10.27% |
| `set_param_entered_value` | payload median | 759245 B | 1547 B | -99.80% |
| `set_param_entered_value` | payload p95 | 759245 B | 1547 B | -99.80% |
| `set_param_name_and_value` | latency median | 211.0034 ms | 211.5765 ms | -0.27% |
| `set_param_name_and_value` | latency p95 | 323.5484 ms | 328.2233 ms | -1.44% |
| `set_param_name_and_value` | payload median | 759460 B | 1544 B | -99.80% |
| `set_param_name_and_value` | payload p95 | 759460 B | 1544 B | -99.80% |
| `set_code_obj_name` | latency median | 212.3195 ms | 212.8156 ms | -0.23% |
| `set_code_obj_name` | latency p95 | 328.8700 ms | 326.6611 ms | +0.67% faster |
| `set_code_obj_name` | payload median | 759335 B | 1537 B | -99.80% |
| `set_code_obj_name` | payload p95 | 759335 B | 1537 B | -99.80% |

## Notes

- Primary win is transport size: roughly `~491x` smaller payloads per op on this
  synthetic setup.
- ACK latency is mostly flat/noisy in this tranche; these routes are still
  dominated by update/validation/codegen work rather than websocket
  serialization size.
