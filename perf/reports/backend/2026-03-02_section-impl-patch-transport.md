# section-impl UI routes patch transport

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ dd7abe60 (baseline) -> working tree

## Goal

Continue Phase 1 incremental transport by replacing full project-state websocket
snapshots with revisioned section-impl patches for high-frequency UI-only routes
that mutate one section implementation.

## Change

Added a new websocket patch path:
- `PatchFrontendProjectStateSectionImpl`

Patch payload includes:
- `projectConfigId`
- `sectionId`
- `sectionImpl`
- `previousProjectStateRevision`
- `projectStateRevision`
- `completedOpIds`
- `pendingOpIds`

Backend changes:
- Introduced `_merge_and_broadcast_ui_only_section_impl_patch(...)` with
  revision-aware fallback to full snapshot.
- Added `_broadcast_section_impl_patch(...)` sender helper.
- Routed these UI-only operations to section-impl patch transport:
  - `set_section_tag_color`
  - `set_section_style_color`
  - `set_meta_control_show_section_title`
  - `set_text_block_display_mode`
  - `set_text_block_master_font_size`
  - `set_text_block_meta_control_style`
  - `set_browser_column_widths`
  - `set_browser_area_view_mode`
  - `set_browser_hide_column`
  - `set_browser_saved_searches`
  - `set_text_block_format`
  - `set_social_url`

Frontend changes:
- Added section-impl patch apply path with revision checks and full resync
  fallback on mismatch/apply failure.

## Benchmark scenario

Representative route benchmark: `set_text_block_display_mode`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Add one TextBlock section via `create_top_level_section(...)`.
4. Attach one connected in-memory frontend websocket.
5. Benchmark `set_text_block_display_mode` for 80 measured iterations (5 warmup),
   alternating `Edit`/`Render` display modes.
6. Capture per-iteration:
   - route latency (`set_text_block_display_mode` + `finish_pending_operations`)
   - websocket message type
   - websocket payload bytes

## Results (local)

`set_text_block_display_mode` on 1000-param synthetic state:

- Message type:
  - baseline: `UpdateFrontendProjectState`
  - after: `PatchFrontendProjectStateSectionImpl`

- Websocket payload bytes:
  - baseline median: `760,603`
  - after median: `643`
  - reduction: `99.92%` (`~1182.9x` smaller)

- Route latency:
  - baseline median: `53.8459 ms`
  - after median: `48.8320 ms`
  - median improvement: `~9.31%`

- Tail latency:
  - baseline p95: `142.2930 ms`
  - after p95: `136.2935 ms`
  - p95 improvement: `~4.22%`

## Coverage

Backend:
- `tests/project_state/test_ui_only_fast_path.py::test_ui_only_text_chrome_routes_broadcast_section_impl_patch`

Frontend:
- `frontend/src/state/actions/sectionInfos.test.ts`
  - section-impl patch apply + revision tracking
- `frontend/src/state/actions/websocketReceive.test.ts`
  - section-impl patch apply on matching revision
  - section-impl patch resync on mismatch
