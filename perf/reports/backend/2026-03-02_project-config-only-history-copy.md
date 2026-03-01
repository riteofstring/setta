# project-config-only history copy mode

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ c082e881 (baseline emulation) -> working tree

## Goal

Reduce write latency for project-config-only mutations by avoiding scoped deep
copy of section/code graphs when history entries only need `ProjectConfig`
undo/redo coverage.

## Change

Backend changes:
- Added `project_config_only` mode to `add_new_history_entry(...)`.
- Added `_copy_backend_for_project_config_only_history_entry(...)`:
  - deep copies only the targeted `ProjectConfig`
  - keeps section/code graphs shared for that history entry
- Kept existing scoped project-graph copy mode unchanged for routes that mutate
  section/code graphs.

Routed project-config-only history writes to the new mode:
- `set_gen_code_prefix`
- `set_gen_code_suffix`
- `set_viewport`
- `create_view_mode`
- `delete_view_mode`

Behavioral guardrails:
- Added `test_project_config_only_history_entry_copies_only_project_config`.
- Added `test_set_gen_code_prefix_undo_restores_previous_value`.

## Benchmark scenario

### A) Route-level (`set_gen_code_prefix`)

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Attach one connected in-memory frontend websocket.
4. Benchmark 40 measured iterations (5 warmup).
5. Force non-coalesced history per iteration by clearing
   `history._last_entry_key/_last_entry_ts` before each call.
6. Compare:
   - baseline emulation: route forces old scoped project-graph copy mode
   - after: route uses `project_config_only=True`

### B) History microbenchmark

Method:
1. Same fixture/state setup.
2. Benchmark `add_new_history_entry(...)` (40 measured, 5 warmup) with:
   - `project_config_only=False` (baseline)
   - `project_config_only=True` (after)

## Results (local)

### Route-level (`set_gen_code_prefix`, non-coalesced)

- Route latency:
  - baseline median: `96.1858 ms`
  - after median: `48.2678 ms`
  - median improvement: `~49.82%`

- Tail latency:
  - baseline p95: `358.6535 ms`
  - after p95: `160.5564 ms`
  - p95 improvement: `~55.23%`

- Websocket payload bytes (expectedly unchanged):
  - baseline median: `3,887`
  - after median: `3,882`

### History microbenchmark

- `add_new_history_entry(project_config_id=..., project_config_only=False)`:
  - median: `50.0355 ms`
  - p95: `235.4486 ms`

- `add_new_history_entry(project_config_id=..., project_config_only=True)`:
  - median: `1.6934 ms`
  - p95: `2.4162 ms`

- Improvement:
  - median: `~96.62%`
  - p95: `~98.97%`

## Coverage

Backend:
- `tests/project_state/test_scoped_history_copy.py`
- `tests/project_state/test_gen_code_prefix_suffix_deferred_refresh.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/project_state/test_format_code.py -k "gen_code_prefix or gen_code_suffix"`
- `tests/project_state/test_type_check.py -k "gen_code_prefix or gen_code_suffix"`
