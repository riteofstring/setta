# top-level layout queue coalescing

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce redundant queue work for high-frequency `set_top_level_section_layout` updates
(typically generated while dragging top-level sections) and remove cross-config
head-of-line blocking by partitioning these updates per project config.

## Change

- Added enqueue coalescing key for `set_top_level_section_layout`:
  - `set-top-level-section-layout:{projectConfigId}`
- Added project-config queue partitioning for `set_top_level_section_layout`:
  - `partition_key_fn=_project_config_partition_key_for_queue`
- Added regression coverage:
  - `tests/project_state/test_drag_route_queue_coalescing.py::test_set_top_level_section_layout_coalesces_same_key_updates`

## Validation

- `source activate.sh && pytest tests/project_state/test_drag_route_queue_coalescing.py tests/project_state/test_project_config_view_modes.py`
- Result: `24 passed`.

## Benchmark scenario

1. Create a real settings manager fixture with autosave disabled.
2. Load a callable state with multiple top-level sections.
3. Queue a blocker operation first.
4. Submit `80` `set_top_level_section_layout` requests for the same project config.
5. Compare:
   - `legacy_no_coalesce`: bypass decorator coalescing/partitioning via `_enqueue(..., coalesce_key=None, queue_partition_key=None)`
   - `patched`: call decorated `manager.set_top_level_section_layout(...)`
6. Record average wall time per request and queue handler call counts.

## Results (local)

| Route | Metric | Legacy No-Coalesce | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_top_level_section_layout` | avg wall ms/request | 0.0193 | 0.0165 | -14.51% |
| `set_top_level_section_layout` | queue handler calls | 80 | 1 | -98.75% |

## Notes

- Per-request wall-time difference is modest because this route is already lightweight.
- The primary win is eliminating redundant queued executions (`80 -> 1`), which
  materially reduces queue pressure under drag bursts and protects other work from
  avoidable queue contention.
