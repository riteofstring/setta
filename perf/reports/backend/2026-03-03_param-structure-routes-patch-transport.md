# param structure routes patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Replace full project-state snapshot transport for high-traffic param-structure
mutation routes with targeted patch transport.

Routes converted in this step:
- `add_kwarg`
- `delete_kwarg`
- `delete_selected_params`

## Change

Backend:
- Added `BaseProjectManager` helpers for param-structure patch scoping:
  - `_get_param_container_code_obj_id_for_section(...)`
  - `_get_parent_code_obj_ids_for_section_params(...)`
- Extended `_update_and_broadcast_code_obj_and_section_patches(...)` with
  optional `broadcast_project_config_patch` support so mixed project-config +
  code-obj + section updates can stay on patch transport.
- Route rewrites:
  - `add_kwarg`: code-obj patch (`root + created param`) + section-impl patches
    for affected sections (plus codegen singleton scope).
  - `delete_kwarg`: project-config patch + code-obj patch (`root + removed
    param`) + section-impl patches.
  - `delete_selected_params`: project-config patch + code-obj patch (parent
    containers + removed params) + section-impl patches.

Tests:
- Added `tests/project_state/test_param_structure_patch_transport.py`:
  - `test_add_kwarg_uses_code_obj_and_section_impl_patch_transport`
  - `test_delete_kwarg_uses_project_config_code_obj_and_section_patch_transport`
  - `test_delete_selected_params_uses_project_config_code_obj_and_section_patch_transport`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_patch_transport_additional_routes.py`

Result:
- Backend targeted tests: `7 passed`.

## Benchmark scenario

Method:
1. `real_settings_manager()` fixture, autosave disabled.
2. Synthetic callable state via `build_callable_project_state(1000)`.
3. Enabled `coreNameEditable` on first five params so
   `delete_selected_params` performs real removals.
4. Two transport modes:
- `legacy_snapshot`: monkeypatched `_update_and_broadcast_code_obj_and_section_patches`
  to call `update_and_broadcast_project_state`.
- `patched`: current route behavior.
5. For each route/mode: 2 warmup + 8 measured iterations.
6. Each measured iteration restores baseline state via `undo(steps=1)`.
7. Metrics per measured op:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- Serialized websocket transport bytes (project-state update + patch message
  types only)

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `add_kwarg` | latency median | 288.5883 ms | 303.0242 ms | -5.00% |
| `add_kwarg` | latency p95 | 395.6437 ms | 429.3001 ms | -8.51% |
| `add_kwarg` | payload median | 772347.5 B | 26165.5 B | -96.61% |
| `add_kwarg` | payload p95 | 772351 B | 26172 B | -96.61% |
| `delete_kwarg` | latency median | 299.4305 ms | 353.1741 ms | -17.95% |
| `delete_kwarg` | latency p95 | 434.9618 ms | 450.1044 ms | -3.48% |
| `delete_kwarg` | payload median | 771067 B | 29755 B | -96.14% |
| `delete_kwarg` | payload p95 | 771067 B | 29755 B | -96.14% |
| `delete_selected_params` | latency median | 19623.0519 ms | 19418.0586 ms | +1.04% faster |
| `delete_selected_params` | latency p95 | 19868.4553 ms | 19984.4862 ms | -0.58% |
| `delete_selected_params` | payload median | 771308 B | 30368 B | -96.06% |
| `delete_selected_params` | payload p95 | 771308 B | 30368 B | -96.06% |

## Notes

- Transport-size reduction is substantial across all three routes (~96% per op).
- ACK latency remains dominated by compute/validation/codegen work for these
  writes, especially `delete_selected_params` at this synthetic scale.
- This tranche removes another set of high-volume snapshot messages and keeps
  revisioned patch semantics aligned across mixed project-config/code-obj/section
  updates.
