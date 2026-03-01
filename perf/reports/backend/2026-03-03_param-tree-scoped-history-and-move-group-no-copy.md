# param-tree scoped history completion + move-group no-copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Complete remaining param-tree deep-copy reductions by:

- switching `indent_params` and `unindent_params` off full project-config history copies,
- removing eager `copy.deepcopy(project_state)` in `move_param_groups`.

## Change

Backend changes in `BaseProjectManager`:

- Added shared helper `_add_param_tree_scoped_history_entry(...)` and routed:
  - `move_params`
  - `move_param_groups`
  - `indent_params`
  - `unindent_params`
  through the same scoped-history pathway.
- Added backend traversal helpers for deterministic parent-target scope:
  - `_get_param_section_impl_and_parent_map_for_backend(...)`
  - `_get_indent_new_parent_ids_for_backend(...)`
  - `_get_unindent_new_parent_ids_for_backend(...)`
- Removed `copy.deepcopy(project_state)` staging from `move_param_groups`; route now mutates the active single-config state directly, matching other param-tree routes.

Behavioral guardrails:

- Added `test_indent_unindent_scoped_history_undo_redo_remains_correct`.
- Existing patch transport tests for move/indent/unindent continue to pass.

## Benchmark scenario

Environment:

- Local dev machine.
- Python env via `source activate.sh`.
- Synthetic callable project state with 1000 params.

Method:

1. Benchmark 40 measured iterations (5 warmup).
2. Route latency measured as route call + `finish_pending_operations(...)`.
3. For one-way route timings, execute opposite reset operation outside timer.
4. Baseline emulation:
   - `indent_params` / `unindent_params`: monkeypatch `add_new_history_entry(...)` to strip scoped history args.
   - `move_param_groups`: monkeypatch method body to previous deep-copy implementation.
5. Also benchmark direct history-entry construction for `indent_params` scope:
   - baseline: `add_new_history_entry(project_config_id=...)`
   - after: `add_new_history_entry(project_config_id=..., code_obj_only_ids=...)`

## Results (local)

Route-level:

- `move_param_groups`
  - baseline median: `487.1390 ms`
  - after median: `434.1317 ms`
  - median improvement: `~10.88%`
  - baseline p95: `980.5263 ms`
  - after p95: `653.6641 ms`
  - p95 improvement: `~33.34%`

- `indent_params`
  - baseline median: `467.7466 ms`
  - after median: `423.7429 ms`
  - median improvement: `~9.41%`
  - baseline p95: `849.5313 ms`
  - after p95: `628.2922 ms`
  - p95 improvement: `~26.04%`

- `unindent_params`
  - baseline median: `469.4093 ms`
  - after median: `411.0849 ms`
  - median improvement: `~12.43%`
  - baseline p95: `1111.2506 ms`
  - after p95: `624.2734 ms`
  - p95 improvement: `~43.82%`

History-entry construction (`indent_params` scope):

- baseline median: `54.2754 ms`
- after median: `10.8431 ms`
- median improvement: `~80.02%`

- baseline p95: `332.5459 ms`
- after p95: `12.2749 ms`
- p95 improvement: `~96.31%`

## Coverage

- `tests/project_state/test_code_obj_scoped_history_copy.py`
- `tests/project_state/test_param_structure_patch_transport.py`
