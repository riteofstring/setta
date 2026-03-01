# Structural routes patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Replace full project-state snapshot transport with a structural patch transport for
section-structure mutation routes.

Routes converted in this tranche:
- `set_section_variant`
- `set_default_section_variant`
- `set_section_variant_sort_order`
- `move_sections`
- `group_sections`
- `ungroup_groups`

## Change

Backend:
- Added `ProjectStateStructuralPatch` and websocket message
  `PatchFrontendProjectStateStructural`.
- Added `WMHFrontendSender.broadcast_project_state_structural_patch(...)`.
- Added `BaseProjectManager` helpers:
  - `_update_and_broadcast_structural_patch(...)`
  - `_broadcast_structural_patch(...)`
- Switched the routes above from `update_and_broadcast_project_state(...)`
  snapshot transport to structural patch transport.

Frontend:
- Added structural patch apply path in `sectionInfos.ts`:
  `applyStructuralProjectStatePatch(...)`.
- Added websocket receive handling in `websocketReceive.ts`:
  `PatchFrontendProjectStateStructural` + revision mismatch resync logic.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py backend/setta/project_state/project_manager_types.py backend/setta/types/websocket.py backend/setta/websockets/msg_handlers/frontend_sender.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py`
- `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/websocketReceive.test.ts`

Result:
- backend tests: `5 passed`
- frontend tests: `54 passed`

## Benchmark scenario

Representative route benchmarks on synthetic callable project state (`1000` params):
- `move_sections` (drag-path structural mutation)
- `set_section_variant` (variant switching structural mutation)

Method:
1. `real_settings_manager()` fixture, autosave disabled.
2. Build baseline state with `build_callable_project_state(1000)`.
3. For `set_section_variant`, create one extra variant for `section-1` and toggle variants per iteration.
4. Two transport modes:
- `legacy_snapshot`: monkeypatched `_update_and_broadcast_structural_patch(...)`
  to call `update_and_broadcast_project_state(...)`.
- `patched`: current structural patch behavior.
5. 3 warmup + 12 measured iterations per route/mode.
6. Metrics per operation:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- Serialized websocket transport bytes for project-state transport messages only:
  - `WebsocketMsgUpdateFrontendProjectState`
  - `WebsocketMsgPatchFrontendProjectStateStructural`

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `move_sections` | latency median | 287.7127 ms | 318.3547 ms | -10.65% |
| `move_sections` | latency p95 | 380.1819 ms | 444.9639 ms | -17.04% |
| `move_sections` | payload median | 759,174 B | 36,810 B | -95.15% |
| `move_sections` | payload p95 | 759,174 B | 36,810 B | -95.15% |
| `set_section_variant` | latency median | 293.8173 ms | 325.3211 ms | -10.72% |
| `set_section_variant` | latency p95 | 425.7166 ms | 434.3010 ms | -2.02% |
| `set_section_variant` | payload median | 1,423,419.5 B | 88,706 B | -93.77% |
| `set_section_variant` | payload p95 | 1,423,429 B | 88,716 B | -93.77% |

## Notes

- Transport size reduction is large on both representative structural routes
  (`~94-95%` less websocket payload).
- Local ACK latency did not improve in this synthetic run; route time remains
  dominated by update/validation/state mutation costs rather than transport size.
- This tranche removes full-snapshot transport from multiple structural routes and
  keeps revisioned patch semantics consistent with other patch transport paths.

---

## Addendum: Remaining structural route conversions (2026-03-03)

### Goal

Eliminate remaining full project-state snapshot transport in structural route
paths inside `BaseProjectManager`.

### Change

Converted these routes from `update_and_broadcast_project_state(...)` to
`_update_and_broadcast_structural_patch(...)`:

- `set_watch_code_enabled`
- `compare_and_set_watch_code_enabled`
- `set_watch_code_inputs`
- `compare_and_set_watch_code_folders`
- `compare_and_set_watch_code_files`
- `create_top_level_section`
- `create_child_sections`
- `create_child_sections_via_incrementer`
- `create_temporary_terminal`
- `delete_sections`
- `delete_child_sections_via_decrementer`
- `create_new_section_variant`
- `delete_section_variant_or_ask`
- `delete_json_source_file_and_variant`
- `set_section_name`
- `set_text_block_heading_as_section_name`
- `paste_sections`

Test coverage additions in `tests/project_state/test_structural_patch_transport.py`:

- `test_remaining_section_routes_use_structural_patch_transport`
- `test_variant_name_and_paste_routes_use_structural_patch_transport`
- `test_watch_code_routes_use_structural_patch_transport`

### Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_ui_setting_reveal_leases.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_watch_code.py -k "baseline_on_enable_skips_existing_defs or baseline_new_watch_inputs_when_enabled or scan_skips_when_watch_code_disabled or disable_cancels_pending_watch_code_scans"`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_set_param_entered_value_ux.py`

Result:

- Targeted backend regression slice: `27 passed`.

### Benchmark scenario

Synthetic callable state (`1000` params), autosave disabled.

Routes benchmarked (representative subset of converted routes):

- `set_section_name`
- `set_watch_code_enabled`
- `create_top_level_section`
- `delete_sections`

Method:

1. Two transport modes:
- `legacy_snapshot`: monkeypatch `_update_and_broadcast_structural_patch(...)`
  to call `update_and_broadcast_project_state(...)`.
- `patched`: native route behavior.
2. `3` warmup + `12` measured iterations per route/mode.
3. Metrics per operation:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- websocket payload bytes from project-state transport message types:
  - `UpdateFrontendProjectState`
  - `PatchFrontendProjectStateProjectConfig`
  - `PatchFrontendProjectStateSectionImpl`
  - `PatchFrontendProjectStateCodeObjs`
  - `PatchFrontendProjectStateStructural`

### Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_section_name` | latency median | 193.9119 ms | 193.0139 ms | +0.46% faster |
| `set_section_name` | latency p95 | 290.4785 ms | 292.6109 ms | -0.73% |
| `set_section_name` | payload median | 759,137.0 B | 36,808.0 B | -95.15% |
| `set_section_name` | payload p95 | 759,137.0 B | 36,808.0 B | -95.15% |
| `set_watch_code_enabled` | latency median | 202.1863 ms | 198.6847 ms | +1.73% faster |
| `set_watch_code_enabled` | latency p95 | 302.8829 ms | 293.4990 ms | +3.10% faster |
| `set_watch_code_enabled` | payload median | 759,322.0 B | 36,804.0 B | -95.15% |
| `set_watch_code_enabled` | payload p95 | 759,323.0 B | 36,805.0 B | -95.15% |
| `create_top_level_section` | latency median | 260.5121 ms | 262.4401 ms | -0.74% |
| `create_top_level_section` | latency p95 | 430.7058 ms | 618.6431 ms | -43.63% |
| `create_top_level_section` | payload median | 773,485.5 B | 50,900.5 B | -93.42% |
| `create_top_level_section` | payload p95 | 781,641.0 B | 59,061.0 B | -92.44% |
| `delete_sections` | latency median | 263.1028 ms | 284.4281 ms | -8.11% |
| `delete_sections` | latency p95 | 606.2232 ms | 650.8311 ms | -7.36% |
| `delete_sections` | payload median | 774,814.5 B | 52,377.5 B | -93.24% |
| `delete_sections` | payload p95 | 782,979.0 B | 60,554.0 B | -92.27% |

### Notes

- Payload reduction is consistent and large for this route subset:
  roughly `93-95%` smaller websocket project-state transport payloads.
- Local ACK latency remains mixed, consistent with compute/validation/codegen
  still dominating end-to-end route time after transport-size reduction.

---

## Addendum: Codegen target route structural patches (2026-03-03)

### Goal

Convert remaining codegen-target routes off full snapshot transport while keeping
existing behavior.

### Change

Converted these routes from `update_and_broadcast_project_state(...)` to
`_update_and_broadcast_structural_patch(...)` (with `validate_name_rules=False`):

- `set_project_config_codegen_targets`
- `compare_and_set_python_codegen_enabled`

Test coverage addition:

- `test_codegen_target_routes_use_structural_patch_transport`
  in `tests/project_state/test_structural_patch_transport.py`.

### Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_ui_setting_reveal_leases.py`

### Benchmark scenario

Synthetic callable state (`1000` params), autosave disabled.

Routes benchmarked:

- `set_project_config_codegen_targets`
- `compare_and_set_python_codegen_enabled`

Method:

1. Two modes:
- `legacy_snapshot`: monkeypatch `_update_and_broadcast_structural_patch(...)`
  to call `update_and_broadcast_project_state(...)`.
- `patched`: native behavior.
2. `3` warmup + `12` measured iterations per route/mode.
3. Metrics:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- websocket payload bytes from project-state transport message types:
  - `UpdateFrontendProjectState`
  - `PatchFrontendProjectStateProjectConfig`
  - `PatchFrontendProjectStateSectionImpl`
  - `PatchFrontendProjectStateCodeObjs`
  - `PatchFrontendProjectStateStructural`

### Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_project_config_codegen_targets` | latency median | 240.3709 ms | 234.0047 ms | +2.65% faster |
| `set_project_config_codegen_targets` | latency p95 | 410.5599 ms | 537.5206 ms | -30.92% |
| `set_project_config_codegen_targets` | payload median | 799,985.0 B | 77,667.5 B | -90.29% |
| `set_project_config_codegen_targets` | payload p95 | 843,523.0 B | 121,100.0 B | -85.64% |
| `compare_and_set_python_codegen_enabled` | latency median | 235.5269 ms | 236.9538 ms | -0.61% |
| `compare_and_set_python_codegen_enabled` | latency p95 | 513.0572 ms | 410.3542 ms | +20.02% faster |
| `compare_and_set_python_codegen_enabled` | payload median | 800,014.5 B | 77,668.5 B | -90.29% |
| `compare_and_set_python_codegen_enabled` | payload p95 | 843,557.0 B | 121,101.0 B | -85.64% |

### Notes

- Payload transport shrank by roughly `86-90%` for both converted routes.
- Local latency remains mixed; these flows include structural mutations (section
  create/delete of codegen singleton sections) that can dominate wall time.

---

## Addendum: Rename acceptance patch transport (2026-03-03)

### Goal

Convert `accept_rename_refactor` from full snapshot transport to targeted patch
transport.

### Change

- Added rename patch-scope extraction in `BaseProjectManager` via
  `_collect_rename_result_patch_scope(...)`.
- Converted `accept_rename_refactor` to
  `_update_and_broadcast_code_obj_and_section_patches(...)` with:
  - code-obj patch scope derived from rename dependency keys,
  - section patch scope derived from touched sections (+ codegen singleton
    expansion via existing helper).
- Added `tests/project_state/test_rename_refactor_patch_transport.py` covering:
  - no full snapshot broadcast,
  - code-obj + section patch usage,
  - name-validation broadcast parity,
  - pending rename entry consumption and state update behavior.

### Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_rename_refactor_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_rename_refactor_patch_transport.py tests/project_state/test_rename_refactor_broadcast.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_ui_setting_reveal_leases.py tests/project_state/test_rename_refactor_patch_transport.py`

### Benchmark scenario

Synthetic callable state (`1000` params), autosave disabled.

Route benchmarked:

- `accept_rename_refactor`

Method:

1. Two modes:
- `legacy_snapshot`: monkeypatch
  `_update_and_broadcast_code_obj_and_section_patches(...)` to call
  `update_and_broadcast_project_state(...)`.
- `patched`: native behavior.
2. `3` warmup + `12` measured iterations.
3. Each iteration seeds a pending rename entry for `section-1` callable name,
   then calls `accept_rename_refactor`.
4. Metrics:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- websocket payload bytes from project-state transport message types:
  - `UpdateFrontendProjectState`
  - `PatchFrontendProjectStateProjectConfig`
  - `PatchFrontendProjectStateSectionImpl`
  - `PatchFrontendProjectStateCodeObjs`
  - `PatchFrontendProjectStateStructural`

### Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `accept_rename_refactor` | latency median | 163.6664 ms | 164.8075 ms | -0.70% |
| `accept_rename_refactor` | latency p95 | 264.3987 ms | 260.5715 ms | +1.45% faster |
| `accept_rename_refactor` | payload median | 759,281.0 B | 13,372.0 B | -98.24% |
| `accept_rename_refactor` | payload p95 | 759,282.0 B | 13,373.0 B | -98.24% |

### Notes

- Payload reduction is very large (`~98%`) for rename acceptance.
- Local latency remained near-flat while transport overhead dropped sharply.

---

## Addendum: Watch-code file update/delete patch transport (2026-03-03)

### Goal

Convert internal watch-code file update/delete handlers off full snapshot transport,
including structural callable-create/delete flows.

### Change

Backend:

- Added `WatchCodeMutationScope` in `watch_code.py` to capture exact mutation
  scope for watch-code processing:
  - `did_update`
  - `structural_changed`
  - touched `section_ids`
  - touched `code_obj_ids`
- Updated watch-code update paths to return/merge scope metadata:
  - `apply_scan_update(...)`
  - `apply_delete_update(...)`
  - `_apply_callable_updates(...)`
  - `_update_sections_for_callables(...)`
  - callable-removal helpers.
- Converted `BaseProjectManager` watch-code handlers:
  - `apply_watch_code_file_update`
  - `apply_watch_code_file_delete`
  to patch transport via new helper
  `_broadcast_watch_code_mutation_scope(...)`.
- Added combined broadcast helper
  `_update_and_broadcast_structural_and_code_obj_patches(...)` for watch-code
  structural mutations that also touch code objects.
- Added `project_state`-aware singleton scope support in
  `_build_section_patch_scope_with_codegen_singletons(...)` to avoid backend/
  in-flight single-config mismatch when watch-code mutates section structure
  before merge.

Tests:

- Added `test_watch_code_file_update_and_delete_use_patch_transport` in
  `tests/project_state/test_watch_code.py`.

### Validation

- `source activate.sh && ruff check backend/setta/project_state/watch_code.py backend/setta/project_state/base_project_manager.py tests/project_state/test_watch_code.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_watch_code.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_ui_setting_reveal_leases.py tests/project_state/test_rename_refactor_patch_transport.py tests/project_state/test_watch_code.py`

Result:

- Targeted backend regression slice: `61 passed`.

### Benchmark scenario

Synthetic callable state (`1000` params), autosave disabled.

Routes benchmarked:

- `apply_watch_code_file_update` (add callable; structural path)
- `apply_watch_code_file_update` (signature change; non-structural path)
- `apply_watch_code_file_delete`

Method:

1. Two modes:
- `legacy_snapshot`: monkeypatch `_broadcast_watch_code_mutation_scope(...)`
  to call `update_and_broadcast_project_state(...)`.
- `patched`: native behavior.
2. `3` warmup + `12` measured iterations per route/mode.
3. ACK metric per operation:
- `route(...)` + `finish_pending_operations(...)` wall time.
4. Payload metric:
- Serialized websocket bytes for project-state transport message types:
  - `WebsocketMsgUpdateFrontendProjectState`
  - `WebsocketMsgPatchFrontendProjectStateProjectConfig`
  - `WebsocketMsgPatchFrontendProjectStateSectionImpl`
  - `WebsocketMsgPatchFrontendProjectStateCodeObjs`
  - `WebsocketMsgPatchFrontendProjectStateStructural`

### Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `apply_watch_code_file_update` (add callable) | latency median | 287.1054 ms | 286.7578 ms | +0.12% faster |
| `apply_watch_code_file_update` (add callable) | latency p95 | 384.7658 ms | 387.0934 ms | -0.60% |
| `apply_watch_code_file_update` (add callable) | payload median | 762,671 B | 40,352 B | -94.71% |
| `apply_watch_code_file_update` (add callable) | payload p95 | 762,678 B | 40,358 B | -94.71% |
| `apply_watch_code_file_update` (signature change) | latency median | 212.9307 ms | 211.5104 ms | +0.67% faster |
| `apply_watch_code_file_update` (signature change) | latency p95 | 310.6000 ms | 316.1417 ms | -1.78% |
| `apply_watch_code_file_update` (signature change) | payload median | 762,682 B | 6,607 B | -99.13% |
| `apply_watch_code_file_update` (signature change) | payload p95 | 762,682 B | 6,607 B | -99.13% |
| `apply_watch_code_file_delete` | latency median | 211.9363 ms | 205.4411 ms | +3.06% faster |
| `apply_watch_code_file_delete` | latency p95 | 313.5265 ms | 313.2612 ms | +0.08% faster |
| `apply_watch_code_file_delete` | payload median | 759,392 B | 36,849 B | -95.15% |
| `apply_watch_code_file_delete` | payload p95 | 759,392 B | 36,849 B | -95.15% |

### Notes

- Payload reduction is large across all measured watch-code file update/delete
  flows (`~95-99%` smaller project-state transport).
- Latency is flat-to-improved locally; this route family now avoids full
  snapshot transport while preserving structural/code-obj correctness.

---

## Addendum: `set_callable` + auto-refetch patch transport (2026-03-03)

### Goal

Eliminate remaining full snapshot transport in callable-binding refresh flows:

- `set_callable`
- `_refetch_callable_params` (used by `auto_refetch_callable_params` and
  `auto_refetch_callable_params_on_lsp_mismatch`)

### Change

Backend:

- Added set-callable patch-scope helpers in `BaseProjectManager`:
  - `_did_set_callable_update_section(...)`
  - `_collect_set_callable_code_obj_patch_ids(...)`
- Converted `_refetch_callable_params(...)` to:
  - aggregate touched `section_ids` and `code_obj_ids` across refetch targets,
  - emit one scoped
    `_update_and_broadcast_code_obj_and_section_patches(...)` broadcast instead
    of `update_and_broadcast_project_state(...)`.
- Converted `set_callable(...)` to patch transport:
  - section scope always includes target section (+ codegen singleton expansion),
  - code-obj patches are emitted when code-object mutation is expected
    (`SignatureHelpStatus.MATCHED` or new callable creation),
  - preserves prior `validate_name_rules=False` behavior.

Tests:

- Added route coverage in
  `tests/project_state/test_param_structure_patch_transport.py`:
  - `test_set_callable_uses_code_obj_and_section_patch_transport`
  - `test_set_callable_clear_uses_section_patch_transport`
- Added auto-refetch transport coverage in
  `tests/project_state/test_auto_refetch_history.py`:
  - `test_auto_refetch_mutation_uses_patch_transport`

### Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_auto_refetch_history.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_auto_refetch_history.py tests/project_state/test_watch_code.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_ui_setting_reveal_leases.py tests/project_state/test_rename_refactor_patch_transport.py tests/project_state/test_watch_code.py tests/project_state/test_auto_refetch_history.py`

Result:

- Targeted regression slices: `39 passed` and `68 passed`.

### Benchmark scenario

Synthetic callable state (`1000` params), autosave disabled.

Routes benchmarked:

- `set_callable` (new callable name, `refetchParams=True`)
- `auto_refetch_callable_params`

Method:

1. Two modes:
- `legacy_snapshot`: monkeypatch
  `_update_and_broadcast_code_obj_and_section_patches(...)` to call
  `update_and_broadcast_project_state(...)`.
- `patched`: native behavior.
2. `3` warmup + `12` measured iterations per route/mode.
3. ACK metric:
- `route(...)` + `finish_pending_operations(...)` wall time.
4. Payload metric:
- Serialized websocket bytes for project-state transport message types:
  - `UpdateFrontendProjectState`
  - `PatchFrontendProjectStateProjectConfig`
  - `PatchFrontendProjectStateSectionImpl`
  - `PatchFrontendProjectStateCodeObjs`
  - `PatchFrontendProjectStateStructural`

### Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_callable` | latency median | 222.4600 ms | 232.0482 ms | -4.31% |
| `set_callable` | latency p95 | 356.1551 ms | 452.6793 ms | -27.10% |
| `set_callable` | payload median | 722,367.0 B | 1,685.0 B | -99.77% |
| `set_callable` | payload p95 | 722,371.9 B | 1,688.5 B | -99.77% |
| `auto_refetch_callable_params` | latency median | 256.6231 ms | 251.8302 ms | +1.87% faster |
| `auto_refetch_callable_params` | latency p95 | 364.3298 ms | 364.1007 ms | +0.06% faster |
| `auto_refetch_callable_params` | payload median | 759,224.0 B | 593.0 B | -99.92% |
| `auto_refetch_callable_params` | payload p95 | 759,224.0 B | 593.0 B | -99.92% |

### Notes

- Payload reduction is very large for both converted routes (`~99.8-99.9%`).
- `set_callable` local latency was slower in this run despite much smaller
  transport payload; callable mutation/codegen work dominates wall time here.
- `auto_refetch_callable_params` latency stayed flat-to-slightly improved while
  eliminating snapshot transport.
