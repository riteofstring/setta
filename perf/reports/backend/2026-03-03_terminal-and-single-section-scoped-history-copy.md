# terminal/single-section scoped history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce route ACK latency by replacing full project-config history snapshots with
scoped project-config+section history entries for routes that mutate a narrow
section set.

## Change

`backend/setta/project_state/base_project_manager.py`:

- Converted these routes from full-copy history (`add_new_history_entry(project_config_id=...)`) to scoped project-config history via `_add_project_config_and_scoped_history_entry(...)`:
  - `set_type_error_ignore(...)`
  - `set_code_section_diagnostics_mute(...)`
  - `set_code_section_diagnostic_code_suppression(...)`
  - `set_code_file_binding(...)`
  - `set_code_section_attached_terminal(...)`
  - `ensure_code_section_attached_terminal_for_run(...)`
- Added backend helper:
  - `_get_code_section_attached_terminal_id_for_backend(...)`
- `set_code_section_attached_terminal(...)` now computes terminal history scope
  from backend parent topology before history capture.
- `ensure_code_section_attached_terminal_for_run(...)` now captures scoped
  history before mutation and reacquires fresh single-config state afterward.

`tests/project_state/test_scoped_history_copy.py`:

- Added
  `test_set_code_section_attached_terminal_history_copy_isolates_affected_sections`
  to verify:
  - project config is copied,
  - affected code+terminal section graphs are copied,
  - unrelated section graph remains shared,
  - undo restores parent mapping.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_scoped_history_copy.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_scoped_history_copy.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_code_section_attached_terminal.py tests/project_state/test_project_config_view_modes.py -q`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_patch_transport_additional_routes.py tests/terminals/test_run_code_attached_terminal.py -q`

Result:

- `51 passed` across the selected suites.

## Benchmark scenario

Synthetic benchmark on callable state with `1000` params plus one top-level code
section and one top-level terminal section.

Method:

1. Build state with `build_callable_project_state(1000)`.
2. Measure two modes:
   - `legacy_full_copy` (emulated): monkeypatch
     `_add_project_config_and_scoped_history_entry(...)` to old behavior
     `add_new_history_entry(project_config_id=...)`.
   - `patched`: native scoped history behavior.
3. Benchmarks:
   - history-entry microbenchmark (attach-terminal history scope only),
   - route latency benchmark for `set_code_section_attached_terminal(...)`.
4. Warmup/measured:
   - history: `5` warmup + `40` measured
   - route: `3` warmup + `12` measured
5. Route samples reset state each run via `undo(steps=1)`.

## Results (local)

| Scenario | Metric | Legacy Full Copy | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| attach-terminal history entry | median | 52.1968 ms | 4.0363 ms | +92.27% faster |
| attach-terminal history entry | p95 | 158.5254 ms | 101.8001 ms | +35.78% faster |
| `set_code_section_attached_terminal` | latency median | 225.6721 ms | 176.6136 ms | +21.74% faster |
| `set_code_section_attached_terminal` | latency p95 | 351.1193 ms | 282.7689 ms | +19.46% faster |

## Notes

- The dominant win remains history construction cost reduction.
- Route-level latency improved by ~22% median in this synthetic heavy-state
  setup.
