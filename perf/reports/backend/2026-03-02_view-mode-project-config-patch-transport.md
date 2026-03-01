# view-mode routes project-config patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ cebbca86 (baseline) -> working tree

## Goal

Extend revisioned incremental project-state transport beyond active-view-mode switching,
starting with high-frequency view-mode metadata routes that only mutate
`projectConfig` data.

## Change

Added a new websocket patch path:
- `PatchFrontendProjectStateProjectConfig`

Patch payload includes:
- `projectConfigId`
- `projectConfig`
- `previousProjectStateRevision`
- `projectStateRevision`
- `completedOpIds`
- `pendingOpIds`

Backend routing changes:
- Introduced `_merge_and_broadcast_ui_only_project_config_patch(...)` with
  revision-aware fallback to full snapshot.
- Routed these operations through that helper:
  - `toggle_is_editing_view_mode`
  - `toggle_section_visibility`
  - `toggle_view_mode_user_facing`
  - `toggle_view_mode_tab`
  - `set_view_mode_name`
  - `set_view_mode_sort_order`

Frontend handling changes:
- Added patch application for project-config replacement with revision checks and
  resync fallback.

## Benchmark scenario

Representative route benchmark: `toggle_view_mode_tab`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Attach one in-memory connected frontend websocket.
4. Benchmark `toggle_view_mode_tab` for 40 measured iterations (5 warmup).
5. For each iteration, capture:
   - end-to-end route latency (`toggle_view_mode_tab` + `finish_pending_operations`)
   - websocket message type
   - websocket payload size in bytes

Baseline commit:
- `cebbca86` (before this step)

After commit state:
- working tree (this step)

## Results (local)

`toggle_view_mode_tab` on 1000-param synthetic state:

- Message type:
  - baseline: `UpdateFrontendProjectState`
  - after: `PatchFrontendProjectStateProjectConfig`

- Websocket payload bytes:
  - baseline median: `759,367.5`
  - after median: `3,846.0`
  - reduction: `99.49%` (`~197.44x` smaller)

- Route latency:
  - baseline median: `49.2940 ms`
  - after median: `46.1573 ms`
  - median improvement: `~6.36%`

- Tail latency:
  - baseline p95: `136.1963 ms`
  - after p95: `133.9091 ms`
  - p95 improvement: `~1.68%`

Notes:
- Both runs include occasional tail outliers in this local async test harness,
  but payload reduction is deterministic and dominant.

## Coverage

Backend:
- `tests/project_state/test_project_config_view_modes.py::TestProjectConfigViewModes::test_toggle_view_mode_tab_broadcasts_project_config_patch`

Frontend:
- `frontend/src/state/actions/websocketReceive.test.ts`
  - applies project-config patch on matching revision
  - resyncs on revision mismatch
- `frontend/src/state/actions/sectionInfos.test.ts`
  - applies project-config patch and tracks revision
