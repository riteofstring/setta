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
