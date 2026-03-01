# section lifecycle scoped history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce ACK latency for remaining section lifecycle routes by replacing full
project-config history snapshots with scoped project-config+section/code-obj
history entries.

## Change

`backend/setta/project_state/base_project_manager.py`:

- Converted these routes from full-copy history
  (`add_new_history_entry(project_config_id=...)`) to
  `_add_project_config_and_scoped_history_entry(...)`:
  - `create_top_level_section(...)`
  - `create_child_sections(...)`
  - `create_child_sections_via_incrementer(...)`
  - `create_temporary_terminal(...)`
  - `delete_sections(...)`
  - `delete_child_sections_via_decrementer(...)`
  - `create_new_section_variant(...)`
- Added backend helpers for deterministic history scope resolution:
  - `_get_parent_section_id_for_incrementer_create_for_backend(...)`
  - `_get_decrementer_delete_section_ids_for_backend(...)`
  - `_get_delete_sections_history_scope_for_backend(...)`
  - `_get_create_new_section_variant_history_scope_for_backend(...)`

`tests/project_state/test_scoped_history_copy.py`:

- Added scoped-history regression coverage:
  - `test_create_child_sections_history_copy_isolates_parent_section_graph`
  - `test_delete_sections_history_copy_isolates_parent_section_graph`
  - `test_create_new_section_variant_history_copy_isolates_section_and_code_objs`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_scoped_history_copy.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_scoped_history_copy.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_code_section_attached_terminal.py tests/terminals/test_run_code_attached_terminal.py -q`

Result:

- `36 passed`.

## Benchmark scenario

Synthetic benchmark on callable project state with `1000` params.

Method:

1. Build state via `build_callable_project_state(1000)` on `real_settings_manager()`.
2. Compare two modes:
   - `legacy_full_copy` (emulated): monkeypatch
     `_add_project_config_and_scoped_history_entry(...)` to old behavior
     `add_new_history_entry(project_config_id=...)`.
   - `patched`: native scoped-history behavior.
3. Benchmark route latency (`route(...) + finish_pending_operations(...)`) for:
   - `create_child_sections(...)`
   - `delete_sections(...)`
   - `create_new_section_variant(...)`
4. Benchmark history-entry construction for the `delete_sections` scope only.
5. Warmup/measured:
   - route: `3` warmup + `12` measured
   - history-entry: `5` warmup + `40` measured
6. Reset state between samples via `undo(steps=1)`.

## Results (local)

| Scenario | Metric | Legacy Full Copy | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `create_child_sections` | latency median | 266.7375 ms | 207.3940 ms | +22.25% faster |
| `create_child_sections` | latency p95 | 379.3876 ms | 317.1178 ms | +16.41% faster |
| `delete_sections` | latency median | 365.0423 ms | 262.2497 ms | +28.16% faster |
| `delete_sections` | latency p95 | 443.7761 ms | 360.4387 ms | +18.78% faster |
| `create_new_section_variant` | latency median | 268.4860 ms | 223.6561 ms | +16.70% faster |
| `create_new_section_variant` | latency p95 | 391.7995 ms | 328.8995 ms | +16.05% faster |
| `delete_sections` history entry | median | 53.8026 ms | 4.1462 ms | +92.29% faster |
| `delete_sections` history entry | p95 | 161.4825 ms | 9.5720 ms | +94.07% faster |

## Notes

- Largest deterministic win is history construction cost: `~54 ms` to `~4 ms`
  median for the delete-scope entry.
- Route-level median improvements ranged from `~16.7%` to `~28.2%` in this
  heavy-state synthetic benchmark.
