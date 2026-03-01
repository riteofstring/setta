# Name-validation section/project cache reuse + unchanged broadcast skip

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Continue Phase-5 name-validation optimization by removing remaining avoidable
work on high-frequency code-obj/param edit routes after scoped param recompute:

- avoid recomputing section/project validation when route class cannot change
  section/project names
- avoid rebroadcasting name-validation payloads when computed content is unchanged

Targeted high-edit routes:

- `set_code_obj_name`
- `set_param_name_and_value`

## Change

Backend (`base_project_manager.py`):

- Extended `_broadcast_name_validation_errors(...)` with:
  - `recompute_section_and_project_errors` flag
  - `suppress_unchanged_broadcast` flag
- For code-obj + section patch helpers (`_update_and_broadcast_code_obj_and_section_patches(...)`
  and deferred variant):
  - pass `recompute_section_and_project_errors=False`
  - keep scoped param recompute behavior
- `_broadcast_name_validation_errors(...)` now:
  - reuses cached `sectionErrors` + `projectErrors` when recompute is disabled
    and cache is warm
  - still recomputes scoped param errors for touched sections
  - updates caches every call
  - skips websocket broadcast when new content equals cached content
- Added helper methods:
  - `_copy_name_validation_errors_by_id(...)`
  - `_name_validation_content_equals(...)`

Tests:

- Updated `tests/project_state/test_name_validation_scoped_recompute.py`:
  - `test_code_obj_name_uses_scoped_param_name_validation_after_cache_warmup`
    now also asserts section/project collectors are called only once (warm-cache
    full pass only).
  - Added
    `test_code_obj_name_skips_name_validation_broadcast_when_payload_unchanged`.
- Updated `tests/project_state/test_param_structure_patch_transport.py`:
  - `test_unindent_params_uses_code_obj_and_section_patch_transport` now expects
    `0` name-validation broadcasts after warm-cache unchanged-content flow.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_name_validation_scoped_recompute.py tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ruff format --check backend/setta/project_state/base_project_manager.py tests/project_state/test_name_validation_scoped_recompute.py tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_name_validation_scoped_recompute.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_param_structure_patch_transport.py -q`

Result:

- Ruff check: passed
- Ruff format check: passed
- Targeted backend tests: `25 passed`

## Benchmark scenario

Environment:

- Local dev machine
- Python env via `source activate.sh`
- Autosave disabled

State shape:

- Synthetic project with `4` callable sections
- `400` params per section (`1600` params total)

Method:

1. Two modes:
   - `legacy_full_section_project_recompute` (emulated): monkeypatch
     `_broadcast_name_validation_errors(...)` to force:
     - `recompute_section_and_project_errors=True`
     - `suppress_unchanged_broadcast=False`
   - `patched_cached_section_project_skip_unchanged`: native behavior.
2. Instrumented collector calls:
   - `collect_param_name_errors_for_sections(...)`
   - `collect_section_name_conflicts(...)`
   - `collect_section_name_format_errors(...)`
   - `collect_text_block_heading_name_errors(...)`
   - `collect_project_name_format_errors(...)`
3. Instrumented name-validation websocket broadcast call count.
4. Disabled deferred refresh scheduling to isolate stage-A ACK path.
5. Per route/mode: `3` warmup + `12` measured iterations.
6. Metric: route call + `finish_pending_operations(...)` latency.

## Results (local)

| Route | Metric | Legacy | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_code_obj_name` | latency median | 160.91 ms | 156.51 ms | +2.74% faster |
| `set_code_obj_name` | latency p95 | 246.40 ms | 166.63 ms | +32.37% faster |
| `set_code_obj_name` | scoped param collector calls (12 iters) | 12 | 12 | unchanged |
| `set_code_obj_name` | section conflict collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_code_obj_name` | section format collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_code_obj_name` | heading collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_code_obj_name` | project collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_code_obj_name` | name-validation broadcasts (12 iters) | 12 | 0 | -100.00% |
| `set_param_name_and_value` | latency median | 166.93 ms | 162.52 ms | +2.64% faster |
| `set_param_name_and_value` | latency p95 | 269.33 ms | 174.00 ms | +35.39% faster |
| `set_param_name_and_value` | scoped param collector calls (12 iters) | 12 | 12 | unchanged |
| `set_param_name_and_value` | section conflict collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_param_name_and_value` | section format collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_param_name_and_value` | heading collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_param_name_and_value` | project collector calls (12 iters) | 12 | 0 | -100.00% |
| `set_param_name_and_value` | name-validation broadcasts (12 iters) | 12 | 0 | -100.00% |

## Notes

- This tranche keeps scoped param recompute intact and removes the remaining
  section/project recompute and socket fanout overhead from warm-cache,
  unchanged-validation edit loops.
- Median gains are modest in local runs, but p95 improved substantially due to
  removal of repeated collector + websocket work on every measured iteration.
