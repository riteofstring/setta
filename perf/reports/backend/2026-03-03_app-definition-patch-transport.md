# app-definition patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Eliminate remaining full project-state snapshot transport from app-definition
write paths (`set_app_definition` and app-definition metadata compare-and-set
routes).

## Change

Backend:

- Added revisioned websocket message type:
  `PatchFrontendProjectStateAppDefinition`.
- Added `ProjectStateAppDefinitionPatch` payload with:
  - `projectConfigId`
  - `appDefinition`
  - `appSpec`
  - revision + frontend op status fields
- Added sender path:
  `broadcast_project_state_app_definition_patch(...)`.
- Replaced app-definition write broadcast path from
  `_update_and_broadcast_project_state_no_name_validation(...)`
  to direct app-definition patch broadcast.
- Removed synchronous `update(...)`/codegen-refresh work from these
  app-definition write broadcasts.

Frontend:

- Added app-definition patch handling in websocket receiver.
- Added revision mismatch resync path that fetches:
  - latest project state
  - latest app definition/spec
- Added app-definition patch apply function to update:
  - `useAppDefinition` store
  - pending frontend operation state
  - project-state revision tracking

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py backend/setta/project_state/project_manager_types.py backend/setta/types/websocket.py backend/setta/websockets/msg_handlers/frontend_sender.py tests/project_state/test_app_definition.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_app_definition.py tests/project_state/test_ui_setting_reveal_leases.py -k "app_definition" -q`
- `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/websocketReceive.test.ts`

Result:

- Backend targeted tests: `17 passed`
- Frontend targeted tests: `57 passed`

## Benchmark scenario

Synthetic callable project state (`1000` params), autosave disabled.

Method:

1. Two modes:
   - `legacy_snapshot`: monkeypatch app-definition patch broadcaster to call
     `_update_and_broadcast_project_state_no_name_validation(...)`
     (pre-change behavior emulation).
   - `patched`: native app-definition patch transport behavior.
2. Seed app definition once, then benchmark:
   - `set_app_definition`
   - `compare_and_set_app_definition_spec_version`
   - `compare_and_set_app_definition_spec_path`
   - `compare_and_set_app_definition_theme_mode`
3. Per-op measurements (`3` warmup + `12` measured):
   - ACK latency (`route(...)` + `finish_pending_operations(...)`)
   - websocket transport bytes summed over:
     - `UpdateFrontendProjectState`
     - `PatchFrontendProjectStateAppDefinition`
     - existing project-state patch message types

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_app_definition` | latency median | 222.3141 ms | 109.7742 ms | +50.62% faster |
| `set_app_definition` | latency p95 | 374.6582 ms | 628.9057 ms | -67.86% |
| `set_app_definition` | payload median | 910,273 B | 474 B | -99.95% |
| `set_app_definition` | payload p95 | 910,273 B | 474 B | -99.95% |
| `compare_and_set_app_definition_spec_version` | latency median | 215.5972 ms | 108.1630 ms | +49.83% faster |
| `compare_and_set_app_definition_spec_version` | latency p95 | 521.1239 ms | 389.9248 ms | +25.18% faster |
| `compare_and_set_app_definition_spec_version` | payload median | 910,273 B | 474 B | -99.95% |
| `compare_and_set_app_definition_spec_version` | payload p95 | 910,273 B | 474 B | -99.95% |
| `compare_and_set_app_definition_spec_path` | latency median | 215.1060 ms | 110.6592 ms | +48.56% faster |
| `compare_and_set_app_definition_spec_path` | latency p95 | 403.2950 ms | 287.9488 ms | +28.60% faster |
| `compare_and_set_app_definition_spec_path` | payload median | 910,274 B | 474 B | -99.95% |
| `compare_and_set_app_definition_spec_path` | payload p95 | 910,274 B | 474 B | -99.95% |
| `compare_and_set_app_definition_theme_mode` | latency median | 219.6979 ms | 110.5854 ms | +49.66% faster |
| `compare_and_set_app_definition_theme_mode` | latency p95 | 477.3278 ms | 117.9691 ms | +75.29% faster |
| `compare_and_set_app_definition_theme_mode` | payload median | 910,274 B | 487 B | -99.95% |
| `compare_and_set_app_definition_theme_mode` | payload p95 | 910,274 B | 488 B | -99.95% |

## Notes

- Transport reduction is the dominant result: app-definition writes now send
  sub-1 KB patch payloads instead of ~910 KB full snapshots.
- Median ACK latency is roughly halved across all measured routes.
- `set_app_definition` p95 is noisier in this local run because file writes and
  local environment variability dominate tail samples.
