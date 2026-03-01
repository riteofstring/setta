# code-obj scoped history copy for param write routes

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce deep-copy overhead in hot param write routes by avoiding full
project-config graph history copies when only one code object is edited.

## Change

Backend changes in `BaseProjectManager`:

- Added `code_obj_only_ids` support to `add_new_history_entry(...)`.
- Added `_copy_backend_for_code_obj_only_history_entry(...)` to deep copy only:
  - targeted `codeObjs`
  - active `codeObjVariants` for those ids in the target project config
  - corresponding `codeObjImpls`
- Scoped-copy composition is now supported:
  - `section_impl_only_ids` and `code_obj_only_ids` can be combined in one
    history entry.

Added helper:

- `_get_codegen_singleton_section_ids_for_history_entry(...)`
  - collects active `GenPythonCode` / `GenPythonMetadata` section ids for a
    project config so codegen singleton updates do not back-propagate into prior
    history snapshots.

Routed to new mode:

- `set_param_entered_value`
  - now records history with
    `code_obj_only_ids={paramInfoId}`
  - and includes codegen singleton sections in `section_impl_only_ids` when
    present.
- `set_param_name_and_value`
  - now records history with
    `code_obj_only_ids={codeObjId}`
  - and includes codegen singleton sections in `section_impl_only_ids` when
    present.

## Verification

- Added `tests/project_state/test_code_obj_scoped_history_copy.py`:
  - `test_code_obj_only_history_entry_copies_only_targeted_code_obj_graph`
  - `test_set_param_entered_value_history_copy_isolates_codegen_singletons`
- Existing UX/behavior coverage for param write routes still passes:
  - `tests/project_state/test_set_param_entered_value_ux.py`
  - `tests/project_state/test_param_name_value_ux.py`

## Benchmark scenario

Representative route benchmark: `set_param_entered_value`

Method:

1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Benchmark 40 measured iterations (5 warmup).
4. Force non-coalesced history each iteration by clearing
   `history._last_entry_key/_last_entry_ts`.
5. Measure ACK latency as route call + `finish_pending_operations(...)`.

Baseline emulation:

- Monkeypatch `add_new_history_entry(...)` to drop new scoped arguments and use
  old `project_config_id=...` full project-config copy mode.

After:

- Native scoped history behavior with `code_obj_only_ids`.

Secondary microbenchmark:

- Direct `add_new_history_entry(...)` comparison (40 measured, 5 warmup):
  - baseline: `project_config_id=...`
  - after: `project_config_id=..., code_obj_only_ids={param-0}`

## Results (local)

`set_param_entered_value` on 1000-param synthetic state:

- ACK latency:
  - baseline median: `111.8871 ms`
  - after median: `66.5438 ms`
  - median improvement: `~40.53%`

- ACK tail latency:
  - baseline p95: `381.9887 ms`
  - after p95: `190.7838 ms`
  - p95 improvement: `~50.06%`

History-entry construction latency:

- baseline (`project_config_id=...`):
  - median: `49.6852 ms`
  - p95: `291.3522 ms`
- after (`code_obj_only_ids={param-0}`):
  - median: `5.0783 ms`
  - p95: `5.9559 ms`

- improvement:
  - median: `~89.78%`
  - p95: `~97.96%`

## Notes

- This is a deep-copy-path optimization, independent from patch transport.
- Codegen singleton section isolation is required for correctness when codegen
  writes mutate `GenPythonCode` / `GenPythonMetadata` in the current history
  revision.
