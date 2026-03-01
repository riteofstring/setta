# Param-tree move routes patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Replace full project-state snapshot transport for remaining param-tree move routes
with targeted code-obj + section-impl patch transport.

Routes converted in this tranche:
- `move_params`
- `move_param_groups`
- `indent_params`
- `unindent_params`

## Change

Backend:
- Replaced `update_and_broadcast_project_state(...)` in the routes above with
  `_update_and_broadcast_code_obj_and_section_patches(...)`.
- Added route-local patch scoping based on parent transitions:
  - capture parent code-obj IDs before and after each move operation,
  - include destination parent IDs,
  - dedupe for `code_obj_ids` patch scope.
- `section_ids` are scoped with
  `_build_section_patch_scope_with_codegen_singletons(...)` using the mutated
  section id so codegen singleton sections stay synchronized when needed.

Tests:
- Extended `tests/project_state/test_param_structure_patch_transport.py` with:
  - `test_move_params_uses_code_obj_and_section_patch_transport`
  - `test_move_param_groups_uses_code_obj_and_section_patch_transport`
  - `test_indent_params_uses_code_obj_and_section_patch_transport`
  - `test_unindent_params_uses_code_obj_and_section_patch_transport`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_set_param_entered_value_ux.py`

Result:
- Targeted backend tests: `17 passed`.

## Benchmark scenario

Synthetic callable project state (`1000` params) benchmarked for representative
param-tree move operations:
- `move_params` (alternating move between callable root and nested parent)
- `move_param_groups` (single-move batch, alternating target parent)
- `indent_params` (with `unindent_params` reset between measured iterations)

Method:
1. `real_settings_manager()` fixture, autosave disabled.
2. Two transport modes:
- `legacy_snapshot`: monkeypatch
  `_update_and_broadcast_code_obj_and_section_patches(...)` to call
  `update_and_broadcast_project_state(...)`.
- `patched`: native route behavior.
3. 3 warmup + 12 measured iterations per route/mode.
4. Metrics per measured operation:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- serialized websocket project-state transport payload bytes for:
  - `UpdateFrontendProjectState`
  - `PatchFrontendProjectStateProjectConfig`
  - `PatchFrontendProjectStateSectionImpl`
  - `PatchFrontendProjectStateCodeObjs`
  - `PatchFrontendProjectStateStructural`

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `move_params` | latency median | 339.6317 ms | 352.4111 ms | -3.76% |
| `move_params` | latency p95 | 528.2403 ms | 712.5772 ms | -34.89% |
| `move_params` | payload median | 771,593.5 B | 26,100.5 B | -96.62% |
| `move_params` | payload p95 | 771,594 B | 26,101 B | -96.62% |
| `move_param_groups` | latency median | 459.2517 ms | 492.5239 ms | -7.24% |
| `move_param_groups` | latency p95 | 745.0682 ms | 779.8274 ms | -4.66% |
| `move_param_groups` | payload median | 771,586.5 B | 26,094.5 B | -96.62% |
| `move_param_groups` | payload p95 | 771,587 B | 26,095 B | -96.62% |
| `indent_params` | latency median | 391.4451 ms | 392.1210 ms | -0.17% |
| `indent_params` | latency p95 | 683.3076 ms | 586.2439 ms | +14.20% faster |
| `indent_params` | payload median | 777,027 B | 26,766 B | -96.56% |
| `indent_params` | payload p95 | 780,479 B | 27,190 B | -96.52% |

## Notes

- Payload reduction is consistent and large across all measured param-tree move
  routes (`~96.5%` smaller websocket transport payloads).
- ACK latency remains mixed in local runs; this aligns with the current state
  where update/validation/codegen compute dominates route wall time after major
  transport-size reductions.
