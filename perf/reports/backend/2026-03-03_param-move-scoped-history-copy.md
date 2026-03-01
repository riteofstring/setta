# param-move routes scoped history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce deep-copy overhead for param-tree move routes by replacing full
`project_config_id=...` history snapshots with scoped code-obj history entries.

## Change

Backend changes in `BaseProjectManager`:

- Updated `move_params` and `move_param_groups` history writes to use:
  - `code_obj_only_ids=...` scoped to parent code-obj ids touched by move requests
  - `section_impl_only_ids=...` for active codegen singleton sections
- Added backend-side helper `_get_param_move_history_code_obj_ids_for_backend(...)`
  that computes move-history scope directly from backend/project-config state without
  `convert_backend_to_single_config(...)`.
- Kept route behavior and patch transport unchanged.

Behavioral guardrails:

- Added `test_move_params_history_copy_isolates_parents_and_codegen_singletons` in
  `tests/project_state/test_code_obj_scoped_history_copy.py`.
- Existing param-structure patch-transport coverage continues to pass.

## Benchmark scenario

### A) Route-level (`move_params`)

Method:

1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Benchmark 40 measured iterations (5 warmup), alternating:
   - move `param-2` under `param-1`
   - move `param-2` back under callable root
4. Measure route ACK latency as `move_params(...) + finish_pending_operations(...)`.
5. Compare:
   - baseline emulation: monkeypatch `add_new_history_entry(...)` to strip
     `code_obj_only_ids` and `section_impl_only_ids`.
   - after: native scoped-history behavior.

### B) History-entry microbenchmark

Method:

1. Same fixture/state setup (1000 params).
2. Benchmark 40 measured iterations (5 warmup) of `add_new_history_entry(...)` for
   move-route scope.
3. Compare baseline emulation vs native scoped-history behavior.

## Results (local)

Route-level (`move_params`):

- baseline median: `367.6758 ms`
- after median: `327.5533 ms`
- median improvement: `~10.91%`

- baseline p95: `696.6792 ms`
- after p95: `475.2431 ms`
- p95 improvement: `~31.78%`

History-entry construction:

- baseline median: `50.9228 ms`
- after median: `10.5697 ms`
- median improvement: `~79.24%`

- baseline p95: `310.0337 ms`
- after p95: `11.4055 ms`
- p95 improvement: `~96.32%`

## Coverage

- `tests/project_state/test_code_obj_scoped_history_copy.py`
- `tests/project_state/test_param_structure_patch_transport.py`
