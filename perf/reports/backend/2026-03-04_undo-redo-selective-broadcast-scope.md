# undo/redo selective broadcast scope by history entry

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce undo/redo cost in multi-project-config sessions by avoiding full
conversion/broadcast over every project config when history navigation only
touches a subset.

## Change

`BaseProjectManager` now tracks per-history-entry project-config scope keyed by
history entry token:

- Added `_history_scope_by_entry_token`.
- `add_new_history_entry(...)` registers scope for current entry token:
  - `{project_config_id}` when scoped to a project config
  - `None` (global fallback) when scope is global/unknown
- Added navigation token collection for undo/redo:
  - `_collect_undo_navigation_entry_tokens(...)`
  - `_collect_redo_navigation_entry_tokens(...)`
- Added scope resolution:
  - `_resolve_project_config_scope_for_navigation_tokens(...)`
  - unknown/global scope falls back to full broadcast (all configs).
- `undo(...)` / `redo(...)` now pass resolved config scope into
  `update_and_broadcast_all_project_state(...)`.
- `update_and_broadcast_all_project_state(...)` now supports optional
  `project_config_ids` filtering.

Scope metadata pruning:

- Added `_prune_history_scope_by_entry_token()` to remove stale token metadata
  when history branches are truncated.

## Verification

- `pytest tests/project_state/test_single_config_state_cache.py tests/project_state/test_undo_redo_state_normalization.py tests/project_state/test_structural_patch_transport.py -q`
- `pytest tests/project_state/test_history_coalescing.py tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_set_callable_undo_redo_stress.py -q`
- `pytest tests/project_state -q`

New regression coverage in `test_single_config_state_cache.py`:

- `test_undo_redo_converts_only_scoped_navigation_project_configs`
- `test_undo_redo_scope_falls_back_to_all_configs_when_unknown`
- `test_multi_step_undo_redo_unions_project_config_scopes`

## Benchmark Scenario

Method:

1. Use `real_settings_manager()` with autosave disabled.
2. Seed one large config via `build_callable_project_state(1000)`.
3. Add 4 extra project configs (total observed: 6 configs in fixture).
4. Create 30 history entries scoped to the primary config.
5. Measure 20 undo/redo pairs (after 5 warmup pairs).
6. Compare:
   - baseline emulation: force scope resolver to return `None`
     (full all-config broadcast each nav, equivalent to prior behavior)
   - optimized: current scoped resolver
7. Record route latency and `convert_backend_to_single_config` call counts.

## Results (local)

With 6 total project configs:

- Combined undo+redo median latency:
  - baseline: `331.618 ms`
  - optimized: `78.835 ms`
  - improvement: `~76.23%`
- Combined undo+redo p95:
  - baseline: `338.579 ms`
  - optimized: `79.913 ms`
  - improvement: `~76.40%`

Conversion work per navigation:

- baseline: `240` conversions over `40` nav calls (`6.00/nav`)
- optimized: `40` conversions over `40` nav calls (`1.00/nav`)
- reduction: `~83.33%` fewer conversions

## Notes

- This is an architectural scope-routing optimization with strict correctness
  fallback: unknown/global history scope still triggers full broadcast.
- Biggest gains appear in multi-config sessions where prior undo/redo cost
  scaled with total config count, not affected config count.
