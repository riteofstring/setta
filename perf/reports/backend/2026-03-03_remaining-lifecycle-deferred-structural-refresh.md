# Remaining lifecycle deferred structural refresh

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Finish deferred stage-A/stage-B rollout for remaining section lifecycle
structural routes still doing synchronous `_refresh_codegen_state(...)` in ACK.

## Change

Backend (`base_project_manager.py`):

- Switched these routes to
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`:
  - `create_top_level_section(...)`
  - `create_child_sections(...)`
  - `create_child_sections_via_incrementer(...)`
  - `create_temporary_terminal(...)`
  - `delete_sections(...)`
  - `delete_child_sections_via_decrementer(...)`
  - `create_new_section_variant(...)`
  - `paste_sections(...)`
- Existing transport and name-validation policies are preserved; only sync
  codegen refresh was moved off ACK to deferred stage-B.

Tests (`tests/project_state/test_structural_patch_transport.py`):

- Added `test_remaining_section_lifecycle_routes_defer_codegen_refresh`.
- Verifies each lifecycle route above:
  - does not trigger synchronous `_refresh_codegen_state(...)` in ACK path,
  - schedules deferred refresh exactly once per operation.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_scoped_history_copy.py -k "remaining_section_routes_use_structural_patch_transport or remaining_section_lifecycle_routes_defer_codegen_refresh or variant_name_and_paste_routes_use_structural_patch_transport or create_child_sections_history_copy_isolates_parent_section_graph or delete_sections_history_copy_isolates_parent_section_graph or create_new_section_variant_history_copy_isolates_section_and_code_objs" -q`

Result:

- Ruff: passed
- Targeted backend tests: `6 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Measured representatives:

- `create_child_sections`
- `delete_sections`
- `paste_sections`

Method:

1. Two modes:
   - `legacy_sync` (emulated): monkeypatch deferred structural helper to call
     `_update_and_broadcast_structural_patch(...)`.
   - `patched_deferred`: native helper behavior.
2. Iterations: `3` warmup + `12` measured.
3. ACK metric: route call + `finish_pending_operations(...)`.
4. In patched mode, flush deferred refresh outside timed ACK window via
   `_flush_pending_deferred_codegen_refresh(...)`.
5. Additional signal: ACK-window `_refresh_codegen_state(...)` call counts.
6. For state stability, setup/cleanup operations run outside timed windows.

## Results (local)

| Route | Metric | Legacy Sync | Patched Deferred | Delta |
| --- | --- | ---: | ---: | ---: |
| `create_child_sections` | latency median | 199.67 ms | 132.81 ms | +33.49% faster |
| `create_child_sections` | latency p95 | 322.69 ms | 283.26 ms | +12.22% faster |
| `create_child_sections` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `delete_sections` | latency median | 204.83 ms | 139.49 ms | +31.90% faster |
| `delete_sections` | latency p95 | 370.07 ms | 306.93 ms | +17.06% faster |
| `delete_sections` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `paste_sections` | latency median | 563.63 ms | 417.33 ms | +25.96% faster |
| `paste_sections` | latency p95 | 738.59 ms | 666.27 ms | +9.79% faster |
| `paste_sections` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |

## Notes

- Deferred schedule deltas for measured operations were `12` per route in patched
  mode, matching one deferred schedule per measured call.
- Overall patched benchmark loop scheduled additional deferred refreshes from
  unmeasured setup/cleanup operations, as expected.
