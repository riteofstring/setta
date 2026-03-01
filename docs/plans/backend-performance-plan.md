# Backend Performance Plan

## Goals
- Improve backend responsiveness on the highest-frequency mutation paths.
- Prioritize large wins that keep behavior predictable and correctness easy to reason about.
- Avoid convoluted architectures (for example, no diff engines or heuristic invalidation).

## Investigation Summary

### Method
- Code-path audit of the main mutation flow:
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/types/helpers_lvl3.py`
  - `backend/setta/project_state/code_files.py`
  - `backend/setta/project_state/jsonSource/jsonSource.py`
  - `backend/setta/project_state/artifacts.py`
  - `backend/setta/websockets/websocket_manager.py`
- Existing benchmark run:
  - `source activate.sh && SETTA_BENCHMARK_OUTPUT=1 ./scripts/run_backend_tests.sh tests/code_gen/test_code_generator_benchmark.py -q`
- Targeted local micro-benchmarks (same machine/session, synthetic callable project with 500 params unless noted).

### Key Measurements
- `set_section_style_color` endpoint end-to-end: `~2951 ms/op`.
- Equivalent lightweight merge+broadcast path (no full update): `~39 ms/op`.
- `set_param_entered_value` endpoint end-to-end (autosave off): `~2356 ms/op`.
- `update()` breakdown:
  - with codegen + watcher refresh: `~1126 ms/op`
  - with codegen, no watcher refresh: `~989 ms/op`
  - no codegen, no watcher refresh: `~71 ms/op`
- `_refresh_codegen_state`: `~887 ms/op`.
- `DependencyGraph(project_state)` build: `~858 ms/op`.
- Watcher refresh calls:
  - `watch_code_files`: `~84.6 ms/call`
  - `watch_json_source_files`: `~6.2 ms/call`
  - `watch_artifact_files`: `~10.8 ms/call`
- `convert_backend_to_single_config`:
  - `~35.9 ms` at 500 params
  - `~97.7 ms` at 1000 params
- Websocket JSON serialization (`model_dump_json`) per message:
  - `~1.9 ms` at 500 params
  - `~3.6 ms` at 1000 params

## Root Causes (Highest Impact First)
1. Many UI-only mutations still run full `update()`:
   - `update()` always validates, rebuilds codegen state, and can refresh watchers (`backend/setta/project_state/base_project_manager.py:2028`).
   - Example: `set_param_entered_value` calls full update flow (`backend/setta/project_state/base_project_manager.py:2960`).
2. Full codegen refresh is dominated by rebuilding dependency graph:
   - `_refresh_codegen_state` always constructs `DependencyGraph(projectState)` when python codegen is enabled (`backend/setta/project_state/base_project_manager.py:1868`).
3. Watcher refresh is done in the same merge path:
   - `_merge_project_state_backend(..., updateFileWatcher=True)` calls all watcher re-registration hooks (`backend/setta/project_state/base_project_manager.py:1985`).
4. Single-config slicing is repeatedly recomputed:
   - `convert_backend_to_single_config` traverses and slices per request (`backend/setta/types/helpers_lvl3.py:194`).
5. Websocket serialization is repeated per socket:
   - `send_message` calls `message.model_dump_json()` for each target websocket (`backend/setta/websockets/websocket_manager.py:184`).

## Plan

### Phase 1: Fast Path for UI-Only Mutations
Goal: remove full codegen/watcher work for mutations that do not affect executable graph or watched file bindings.

1. Add a shared helper for lightweight state commit:
   - Acquire write lock.
   - Merge into backend with `updateFileWatcher=False`.
   - Broadcast snapshot.
   - Pattern already exists for `set_browser_area_view_mode` (`backend/setta/project_state/base_project_manager.py:4763`).
2. Migrate obvious UI-only routes to this path first:
   - `set_section_style_color`
   - `set_section_tag_color`
   - `toggle_minimized`
   - `toggle_position_locks`
   - `toggle_group_orientation`
   - `set_group_overflow_mode`
   - `set_text_block_format`
   - `set_browser_column_widths`
   - `set_browser_hide_column`
   - `set_browser_saved_searches`
   - `set_social_url`
   - Keep `set_chat_section_state` on full refresh for now (it contributes to chat dependency value/codegen state).
3. Add route-level tests proving no full codegen refresh occurs for migrated endpoints.

Expected impact:
- Route latency reductions in the same order as measured `set_section_style_color` (`~2951 ms` to low tens of ms in the synthetic benchmark).

### Phase 2: Stop Paying Watcher Costs on Value-Only Full Updates
Goal: keep full codegen where needed, but skip unrelated watcher refresh.

1. For high-frequency value updates that still need full codegen, pass `updateFileWatcher=False` explicitly when file bindings cannot change:
   - Completed: `set_param_entered_value`.
   - Completed: `set_param_name_and_value`.
   - Completed: `set_code_obj_name`.
   - Continue evaluating similar non-binding updates.
2. Add tests that watched-file callback registration is unchanged after these operations.

Expected impact:
- Roughly the measured watcher delta on this synthetic project (`~137 ms/op`) for affected routes.

### Phase 3: Reduce Full-Rebuild Frequency for Param Value Edits
Goal: address the largest remaining cost (`DependencyGraph` rebuild) on typing-heavy routes.

1. Introduce a dedicated value-update codegen path for `set_param_entered_value`:
   - Use existing `change_value` pathway in generator/runtime state where graph shape is unchanged.
   - Fall back to full refresh if invariants fail.
2. Keep semantics safe:
   - On fallback conditions, run existing full path.
   - Ensure run/type-check entry points force full refresh if state is marked dirty.
3. Add correctness tests that compare generated output from incremental path vs full refresh for representative section types.

Expected impact:
- Major cut to `set_param_entered_value` latency by avoiding repeated `DependencyGraph` rebuild (`~858 ms` component).

### Phase 4: Cheap Serialization/Conversion Wins
Goal: remove avoidable CPU overhead in hot paths.

1. Pre-serialize websocket message payload once per broadcast target set (instead of per socket).
2. Add revision-keyed cache for single-config slicing in read-heavy call sites, with explicit invalidation by history revision.

Expected impact:
- Moderate CPU reduction, especially with larger projects and multiple frontend sockets.

## Verification Plan
- Keep existing benchmark run:
  - `source activate.sh && SETTA_BENCHMARK_OUTPUT=1 ./scripts/run_backend_tests.sh tests/code_gen/test_code_generator_benchmark.py -q`
- Add backend perf-focused tests for high-impact routes (temporary workspace, real manager fixture).
- For each phase, record before/after medians for:
  - `set_section_style_color`
  - `set_param_entered_value`
  - `update()` component timings (codegen/watcher/no-codegen variants)
- Success criteria:
  - UI-only migrated routes avoid `_refresh_codegen_state` entirely.
  - `set_param_entered_value` shows substantial latency drop vs current baseline while preserving run/type-check correctness.

## Non-Goals
- No event-sourced state rewrite.
- No heuristic keyword-based invalidation.
- No large protocol redesign for incremental frontend project-state diffs in this pass.
