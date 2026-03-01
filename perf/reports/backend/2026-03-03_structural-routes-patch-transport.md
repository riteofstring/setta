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
