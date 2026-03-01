# move_sections scoped history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce `move_sections` ACK latency by removing full project-config history copy
from the route hot path while preserving undo/redo correctness.

## Change

`backend/setta/project_state/base_project_manager.py`:

- `move_sections(...)` now:
  - validates request shape first,
  - computes affected section history scope from backend state,
  - records history through `_add_project_config_and_scoped_history_entry(...)`
    with `include_codegen_singletons=True`,
  - reacquires fresh single-config state after history capture before mutation.
- Added backend helpers:
  - `_get_parent_section_map_for_backend(...)`
  - `_get_move_sections_history_section_ids_for_backend(...)`
- History scope now includes:
  - moved sections,
  - prior parent sections of moved sections,
  - destination parent section (when moving into a parent),
  - code-section terminal candidate sections needed for
    `ensure_code_section_embedded_terminal_size(...)`.

`tests/project_state/test_scoped_history_copy.py`:

- Added
  `test_move_sections_history_copy_isolates_project_config_and_affected_sections`
  to verify:
  - project config is deep-copied for history,
  - affected section graphs are copied,
  - unrelated sibling section graph stays shared,
  - undo restores parent mapping correctly.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_scoped_history_copy.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_scoped_history_copy.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_code_section_attached_terminal.py tests/project_state/test_project_config_view_modes.py -q`

Result:

- `46 passed`.

## Benchmark scenario

Synthetic benchmark on callable state with `1000` params plus extra group
sections used for section moves.

Method:

1. `real_settings_manager()` with autosave disabled.
2. Compare two modes:
   - `legacy_full_copy` (emulated): monkeypatch
     `_add_project_config_and_scoped_history_entry(...)` to old behavior
     `add_new_history_entry(project_config_id=...)`.
   - `patched`: native scoped/hybrid history behavior.
3. Route latency measured as `move_sections(...)` +
   `finish_pending_operations(...)`.
4. Warmup/measured:
   - route benchmarks: `3` warmup + `12` measured
   - history-entry microbenchmark: `5` warmup + `40` measured
5. State reset between route samples via `undo(steps=1)`.

Measured scenarios:

- `move_sections` parent-to-parent move (`group_a -> group_b`)
- `move_sections` move to pane (`group_a -> top-level`)
- history-entry construction cost only

## Results (local)

| Scenario | Metric | Legacy Full Copy | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| history-entry construction | median | 50.9619 ms | 7.2840 ms | +85.71% faster |
| history-entry construction | p95 | 253.1116 ms | 9.1528 ms | +96.38% faster |
| `move_sections` parent-to-parent | latency median | 261.1526 ms | 216.2526 ms | +17.19% faster |
| `move_sections` parent-to-parent | latency p95 | 274.2483 ms | 321.8029 ms | -17.34% |
| `move_sections` to pane | latency median | 262.2023 ms | 212.0501 ms | +19.13% faster |
| `move_sections` to pane | latency p95 | 365.3678 ms | 302.9782 ms | +17.08% faster |

## Notes

- Median latency improved in both `move_sections` scenarios.
- Parent-to-parent p95 regressed in this sample set; likely noisy tail from
  refresh/queue variance, but should be monitored in follow-up measurements.
- Core win is deterministic: history-entry construction dropped from
  ~`51 ms` to ~`7 ms` median for this route scope.
