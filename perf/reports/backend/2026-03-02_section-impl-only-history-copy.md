# section-impl-only history copy mode

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ d2ad88cb (baseline emulation) -> working tree

## Goal

Reduce write latency for high-frequency section UI routes by avoiding full
project-config graph copy on each non-coalesced history entry.

## Change

Backend changes:
- Added `section_impl_only_ids` mode to `add_new_history_entry(...)`.
- Added `_copy_backend_for_section_impl_only_history_entry(...)`:
  - deep copies only targeted section cores
  - deep copies active variants and base impls for those sections
  - keeps code obj maps + project config maps shared for that history entry
- Kept existing modes unchanged:
  - full project-config graph copy (`project_config_id=...`)
  - project-config-only copy (`project_config_only=True`)

Routed to the new section-impl-only mode:
- `set_section_sizes`
- `set_section_tag_color`
- `set_section_style_color`
- `set_section_column_width`
- `set_browser_column_widths`

Behavioral guardrails:
- Added `test_section_impl_only_history_entry_copies_only_targeted_section_graph`.
- Added `test_set_section_tag_color_undo_redo_remains_correct_across_project_configs`.

## Benchmark scenario

### A) Route-level benchmarks

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Seed state via `build_state_for_ui_only_fast_path()`.
3. For each route, benchmark 40 measured iterations (5 warmup).
4. Force non-coalesced history per iteration by clearing
   `history._last_entry_key/_last_entry_ts`.
5. Measure end-to-end route call + `finish_pending_operations(...)`.
6. Compare:
   - baseline emulation: monkeypatch `add_new_history_entry` to drop
     `section_impl_only_ids` (old scoped-copy behavior)
   - after: native route behavior with `section_impl_only_ids`

Note:
- This run used no connected frontend websocket clients (absolute times are lower
  than interactive sessions; relative deltas are the signal).

### B) History microbenchmark

Method:
1. Same fixture/state setup.
2. Benchmark `add_new_history_entry(...)` for 60 measured iterations (5 warmup):
   - baseline: `project_config_id=...` (old scoped-copy behavior)
   - after: `project_config_id=..., section_impl_only_ids={section_id}`

## Results (local)

Route-level:
- `set_section_sizes`: baseline median `7.4114 ms`, p95 `8.0818 ms`; after median `4.8860 ms`, p95 `5.4134 ms`; median improvement `~34.08%` (`1.52x`).
- `set_section_column_width`: baseline median `7.2943 ms`, p95 `8.1488 ms`; after median `4.8688 ms`, p95 `5.6081 ms`; median improvement `~33.25%` (`1.50x`).
- `set_browser_column_widths`: baseline median `7.2904 ms`, p95 `8.2450 ms`; after median `4.2712 ms`, p95 `4.7667 ms`; median improvement `~41.41%` (`1.71x`).
- `set_section_tag_color`: baseline median `7.8536 ms`, p95 `8.5220 ms`; after median `4.6785 ms`, p95 `5.2316 ms`; median improvement `~40.43%` (`1.68x`).
- `set_section_style_color`: baseline median `7.9625 ms`, p95 `8.5711 ms`; after median `4.7015 ms`, p95 `5.9793 ms`; median improvement `~40.95%` (`1.69x`).

History microbenchmark:
- baseline (`project_config_id=...`): median `3.2907 ms`, p95 `4.1190 ms`
- after (`section_impl_only_ids={...}`): median `0.8840 ms`, p95 `1.5940 ms`
- median improvement: `~73.14%` (`3.72x`)

## Coverage

- `tests/project_state/test_scoped_history_copy.py`
- `tests/project_state/test_ui_only_fast_path.py`
