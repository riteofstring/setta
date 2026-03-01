# drag-route queue coalescing

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce queue head-of-line pressure for high-frequency drag updates by coalescing
queued work items for the same route+scope key, while preserving final state and
frontend op completion semantics.

Routes covered:
- `set_section_sizes`
- `set_section_column_width`
- `set_browser_column_widths`
- `set_viewport`

## Change

- Added queue coalesce keys for drag-heavy route enqueues:
  - `set_section_sizes`: `projectConfigId + sorted(sectionIds)`
  - `set_section_column_width`: `projectConfigId + sectionId`
  - `set_browser_column_widths`: `projectConfigId + sectionId`
  - `set_viewport`: `projectConfigId`
- Coalescing behavior is last-write-wins per key while preserving completion of all
  coalesced frontend op IDs.
- Added focused regression tests:
  - `tests/project_state/test_drag_route_queue_coalescing.py`
    - same-key coalescing for all four routes
    - different-key non-coalescing coverage
    - final-state assertions + queue handler call-count assertions

## Validation

- Backend:
  - `source activate.sh && pytest tests/project_state/test_drag_route_queue_coalescing.py tests/project_state/test_param_value_queue_coalescing.py tests/project_state/test_ui_only_fast_path.py tests/project_state/test_project_config_view_modes.py`
  - Result: `38 passed`.

## Benchmark scenario

Bursty queue benchmark with intentional head-of-line blocking:
1. Start `real_settings_manager()`, autosave disabled.
2. Load a callable project state with an added browser section.
3. For each route/mode:
   - Enqueue blocker task first.
   - Submit `80` requests via `asyncio.create_task(...)` for the same coalesce scope.
   - Release blocker, await all requests, finish pending operations.
4. Modes:
   - `legacy_no_coalesce`: invoke undecorated route body through `_enqueue(..., coalesce_key=None)`.
   - `patched_coalesce`: invoke normal decorated route.
5. Metrics:
   - wall time per request (`elapsed / 80`)
   - queue handler call count
   - section patch message count (for section-patch routes)

## Results (local)

| Route | Metric | Legacy No-Coalesce | Patched Coalesce | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_section_column_width` | avg wall ms/request | 4.0909 | 0.0527 | -98.71% |
| `set_section_column_width` | queue handler calls | 80 | 1 | -98.75% |
| `set_section_column_width` | section patch calls | 80 | 1 | -98.75% |
| `set_browser_column_widths` | avg wall ms/request | 3.4702 | 0.0524 | -98.49% |
| `set_browser_column_widths` | queue handler calls | 80 | 1 | -98.75% |
| `set_browser_column_widths` | section patch calls | 80 | 1 | -98.75% |
| `set_section_sizes` | avg wall ms/request | 2.3321 | 0.0557 | -97.61% |
| `set_section_sizes` | queue handler calls | 80 | 1 | -98.75% |
| `set_section_sizes` | section patch calls | 80 | 1 | -98.75% |
| `set_viewport` | avg wall ms/request | 0.0426 | 0.0342 | -19.72% |
| `set_viewport` | queue handler calls | 80 | 1 | -98.75% |

## Notes

- The largest gains are on section-patch drag routes where coalescing removes
  redundant backend mutation + patch emission work.
- `set_viewport` already had low per-request overhead; queue-call reduction is still
  substantial and protects mixed workloads from queue contention.
