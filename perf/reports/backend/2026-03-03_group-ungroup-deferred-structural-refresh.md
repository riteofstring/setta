# Group/ungroup deferred structural refresh

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce ACK latency for `group_sections` and `ungroup_groups` by removing
synchronous `_refresh_codegen_state(...)` from these structural write paths.

## Change

Backend (`base_project_manager.py`):

- Updated `group_sections(...)` to use
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`.
- Updated `ungroup_groups(...)` to use
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`.
- This preserves structural patch transport and name-validation behavior while
  shifting full codegen refresh to deferred stage-B.

Tests (`tests/project_state/test_structural_patch_transport.py`):

- Added `test_group_and_ungroup_defer_codegen_refresh`.
- Asserts both routes:
  - do not call `_refresh_codegen_state(...)` synchronously in ACK path,
  - schedule exactly one deferred refresh per operation.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_scoped_history_copy.py -k "move_sections_defers_codegen_refresh or group_and_ungroup_use_structural_patch_transport or group_and_ungroup_defer_codegen_refresh or move_sections_history_copy_isolates_project_config_and_affected_sections" -q`

Result:

- Ruff: passed
- Targeted backend tests: `4 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Method:

1. Benchmark routes:
   - `group_sections` on `section-1`
   - `ungroup_groups` for the resulting group
2. Modes:
   - `legacy_sync` (emulated): monkeypatch
     `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`
     to call `_update_and_broadcast_structural_patch(...)`.
   - `patched_deferred`: native helper behavior.
3. Iterations: `3` warmup + `12` measured (alternating group/ungroup each loop).
4. ACK metric: route call + `finish_pending_operations(...)`.
5. In patched mode, flush deferred refresh outside timed ACK window via
   `_flush_pending_deferred_codegen_refresh(...)` after each op.
6. Additional signal: ACK-window `_refresh_codegen_state(...)` call counts.

## Results (local)

| Route | Metric | Legacy Sync | Patched Deferred | Delta |
| --- | --- | ---: | ---: | ---: |
| `group_sections` | latency median | 156.16 ms | 87.11 ms | +44.21% faster |
| `group_sections` | latency p95 | 261.25 ms | 99.46 ms | +61.93% faster |
| `group_sections` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `ungroup_groups` | latency median | 155.65 ms | 88.05 ms | +43.43% faster |
| `ungroup_groups` | latency p95 | 248.25 ms | 92.03 ms | +62.93% faster |
| `ungroup_groups` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |

## Notes

- This extends the deferred stage-A/stage-B split to both group lifecycle routes
  with material ACK latency reductions in local synthetic runs.
- Deferred refresh scheduling count in the benchmark was `30` for patched mode
  (`2 * (3 warmup + 12 measured)` operations), matching expectations.
