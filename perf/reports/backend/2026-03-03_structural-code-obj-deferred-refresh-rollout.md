# Structural + code-obj deferred refresh rollout

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Finish deferred stage-B rollout for the remaining structural+code-obj patch call
paths that were still paying synchronous stage-A `_refresh_codegen_state(...)` cost
inside `_update_and_broadcast_structural_and_code_obj_patches(...)`.

Targets converted in this tranche:

- Watch-code structural mutation path inside `_broadcast_watch_code_mutation_scope(...)`
- JSON-source load mutation path inside `_broadcast_json_source_load_mutation_scope(...)`

## Change

`backend/setta/project_state/base_project_manager.py`:

- Added deferred helper:
  - `_merge_and_broadcast_structural_and_code_obj_patches_with_deferred_codegen_refresh(...)`
- Switched the two remaining call sites above from:
  - `_update_and_broadcast_structural_and_code_obj_patches(...)`
- To:
  - `_merge_and_broadcast_structural_and_code_obj_patches_with_deferred_codegen_refresh(...)`

Behavioral result:

- Stage-A ACK path now validates + merges + broadcasts structural/code-obj patches
  without synchronous full codegen refresh.
- Stage-B codegen refresh is scheduled via
  `_schedule_deferred_codegen_refresh(project_config_id)`.

## Test coverage updates

- `tests/project_state/test_watch_code.py`
  - Added `test_watch_code_structural_update_defers_codegen_refresh`.
  - Updated patch-transport expectations to reflect unchanged name-validation
    broadcast gating on signature/delete updates.
- `tests/project_state/test_json_source_patch_transport.py`
  - Added `test_load_json_sources_defers_codegen_refresh`.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_watch_code.py tests/project_state/test_json_source_patch_transport.py`
- `source activate.sh && ruff format --check backend/setta/project_state/base_project_manager.py tests/project_state/test_watch_code.py tests/project_state/test_json_source_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_watch_code.py tests/project_state/test_json_source_patch_transport.py -q`

Result:

- Targeted backend tests: `29 passed`.

## Benchmark scenario

Synthetic callable project state (`1000` params), autosave disabled.

Routes benchmarked:

- `watch_code_structural_update` (file update toggling callable identity set)
- `load_json_sources` (JSON-source value updates for a Dict section)

Method:

1. Two modes:
   - `legacy_sync` (emulated): monkeypatch
     `_merge_and_broadcast_structural_and_code_obj_patches_with_deferred_codegen_refresh(...)`
     to call `_update_and_broadcast_structural_and_code_obj_patches(...)`.
   - `patched_deferred`: native deferred helper behavior.
2. For patched mode, `_schedule_deferred_codegen_refresh(...)` was monkeypatched to
   mark pending revision only; deferred refresh was flushed outside the timed window
   via `_flush_pending_deferred_codegen_refresh(...)`.
3. `3` warmup + `12` measured iterations per route/mode.
4. ACK latency metric:
   - route/path call + `finish_pending_operations(...)`.

## Results (local)

| Route/path | Metric | Legacy Sync | Patched Deferred | Delta |
| --- | --- | ---: | ---: | ---: |
| `watch_code_structural_update` | latency median | 107.7215 ms | 113.0102 ms | -4.91% |
| `watch_code_structural_update` | latency p95 | 198.6013 ms | 168.5778 ms | +15.12% faster |
| `load_json_sources` | latency median | 309.8681 ms | 231.8566 ms | +25.18% faster |
| `load_json_sources` | latency p95 | 395.9576 ms | 334.2156 ms | +15.59% faster |

## Notes

- `load_json_sources` sees clear ACK gains from removing synchronous update-path
  codegen refresh.
- `watch_code_structural_update` is mixed: median regressed in this local run while
  p95 improved. This path still performs one synchronous refresh in watch-code
  dependency graph synchronization (`watch_code._update_sections_for_callables(...)`),
  which limits the impact of helper-level deferral.
