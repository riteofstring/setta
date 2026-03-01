# Backend Performance Plan: Next Avenues

## Intent
- Improve backend responsiveness with the biggest wins per unit of complexity.
- Focus on different areas than the completed branch optimizations (watcher skip passes, `set_param_entered_value` incremental codegen, websocket single-serialization, single-config cache).
- Prefer deterministic and correctness-friendly pathways over heuristics.

## Investigation Summary

### Method
- Code-path audit of:
  - `backend/setta/code_gen/dependency_graph.py`
  - `backend/setta/utils/name_validation.py`
  - `backend/setta/types/helpers_lvl1.py`
  - `backend/setta/project_state/base_project_manager.py`
- Targeted micro-benchmarks in the local branch with Python env active (`source activate.sh`), using synthetic callable project states (`build_callable_project_state`).

### Key Measurements

| Path | 500 params | 1000 params | Notes |
| --- | ---: | ---: | --- |
| `DependencyGraph(state)` | `~864.8 ms` | `~3585.3 ms` | ~4x growth when doubling params. |
| `get_curr_effective_code_obj_impl*` loop across params | `~844.9 ms` | `~3589.9 ms` | Dominated by deep-copy effective impl materialization. |
| Direct variant/base impl lookup loop | `~0.187 ms` | `~0.386 ms` | Same information access pattern, without deep copy. |
| `collect_param_name_errors(state)` | `~2612.3 ms` | `~11341.5 ms` | Dominant cost in name-validation pass. |
| `update_and_broadcast_project_state` (unchanged 1000-param state) | n/a | `~26463.8 ms` | Includes full codegen refresh + name validation broadcast. |
| `_update_and_broadcast_project_state_no_name_validation` (same state) | n/a | `~3961.5 ms` | Full update cost without name validation broadcast. |
| `get_latest_project_state_summary` | n/a | `~108.8 ms` | Uses fresh `convert_backend_to_single_config(...)` each call. |
| `get_latest_project_state` | n/a | `~0.059 ms` | Uses revision-keyed single-config cache. |
| `add_new_history_entry` copy | `~20.4 ms` | `~41.8 ms` | Deep-copy history snapshots are measurable but not top bottleneck. |
| Websocket project-state `model_dump_json` | `~1.95 ms` | `~4.17 ms` | Moderate; not top CPU cost right now. |
| `_save_project_state` | `~30.3 ms` | `~93.4 ms` | Save path is meaningful but secondary vs codegen/name-validation hotspots. |

## Root Causes (Priority Order)
1. Effective-impl read helpers are expensive in hot loops.
   - `get_effective_impl(...)` uses `model_copy(..., deep=True)` in `backend/setta/types/generated/effective_impls.py`.
   - Dependency graph and param name validation repeatedly call helpers that materialize these deep copies per param.
2. Param name validation scales poorly and is invoked in expensive update paths.
   - `collect_param_name_errors(...)` dominates validation runtime on large states.
3. `get_latest_project_state_summary` bypasses the existing single-config cache.
   - It always re-slices backend state instead of reusing cached single-config state.

## Plan

### Phase 1: Remove Deep-Copy Effective-Impl Work From Hot Read Paths
Goal: cut the largest CPU cost with minimal behavior change.

1. Add a read-focused helper for code obj/section impl resolution that:
   - Uses base impl directly when `core.sharedModifier` and `variant.modifier` are both empty.
   - Falls back to existing effective-impl behavior when modifiers exist.
2. Apply this helper in:
   - `DependencyGraph.export_params(...)`
   - `collect_param_name_errors(...)`
3. Keep existing mutation helpers unchanged (no broad semantic shift in write paths).

Expected impact:
- Largest branch-wide win, because this directly targets the current dominant cost in codegen graph rebuild and param validation scans.

Verification:
- Existing dependency graph and name-validation correctness tests.
- Add focused tests for modifier-present cases to ensure fallback parity.
- Record before/after in `perf/reports/backend/` for:
  - `DependencyGraph(500/1000)`
  - `collect_param_name_errors(500/1000)`

### Phase 2: Make Name-Validation Broadcast Cost Proportional to Need
Goal: avoid paying full param-name validation on updates that do not affect names.

1. Introduce explicit route-level name-validation intent at commit points:
   - `name_validation_mode="full"` for name/structure-affecting mutations.
   - `name_validation_mode="none"` otherwise.
2. Default new/updated routes to explicit mode (no implicit full validation path).
3. Add a revision-keyed cache for name-validation payloads to avoid recomputation during repeated broadcasts in the same revision.

Expected impact:
- Removes multi-second validation overhead from non-name mutation routes while preserving strict validation where required.

Verification:
- Route behavior tests for representative mutations in both modes.
- Benchmark parity checks on:
  - `update_and_broadcast_project_state(...)`
  - `_update_and_broadcast_project_state_no_name_validation(...)`

### Phase 3: Fix Read-Path Summary Hotspot
Goal: deliver a low-risk, high-leverage read latency win.

1. Change `get_latest_project_state_summary` to source state via `get_single_config_state(...)` (cache-aware).
2. Add revision-keyed cache for the derived summary payload.
3. Make this read route non-serialized (`require_serialization=False`) and keep a read lock for safety.

Expected impact:
- Shrinks a ~100ms read call to near summary-construction cost, and avoids queue contention with long write operations.

Verification:
- Unit tests for cache invalidation on history revision change.
- Micro-benchmark before/after for summary route latency.

## Non-Goals
- No event-sourced rewrite.
- No heuristic keyword matching or fuzzy invalidation.
- No protocol redesign for frontend incremental diffs in this pass.

## Success Criteria
- `DependencyGraph(1000)` reduced by at least 60%.
- `collect_param_name_errors(1000)` reduced by at least 80%.
- `get_latest_project_state_summary` reduced by at least 70%.
- No behavioral regressions in existing backend tests for dependency graph, validation, and project-state routes.
