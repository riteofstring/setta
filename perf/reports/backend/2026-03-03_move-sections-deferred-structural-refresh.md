# Move-sections deferred structural refresh

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce `move_sections` ACK latency by removing synchronous `_refresh_codegen_state(...)`
from this high-frequency structural drag path.

## Change

Backend (`base_project_manager.py`):

- Added `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`.
- This helper:
  - validates + merges under write lock,
  - broadcasts structural patch transport,
  - schedules deferred stage-B codegen refresh,
  - preserves snapshot fallback when revision does not advance.
- Updated `move_sections(...)` to use the new helper with:
  - `validate_name_rules=False`
  - `broadcast_name_validation_errors=False`

Tests:

- Added `test_move_sections_defers_codegen_refresh` in
  `tests/project_state/test_structural_patch_transport.py`.
- Asserts `move_sections`:
  - does not call `_refresh_codegen_state(...)` synchronously in ACK path,
  - schedules exactly one deferred refresh for the target project config.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py -k "move_sections_uses_structural_patch_transport or move_sections_defers_codegen_refresh or group_and_ungroup_use_structural_patch_transport" -q`

Result:

- Ruff: passed
- Targeted backend tests: `3 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Method:

1. Route benchmark: `move_sections` top-level position toggles on `section-1`.
2. Two modes:
- `legacy_sync` (emulated): monkeypatch
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`
  to call `_update_and_broadcast_structural_patch(...)`.
- `patched_deferred`: native helper behavior.
3. Warmup/measured: `3` warmup + `12` measured iterations.
4. ACK metric: route call + `finish_pending_operations(...)`.
5. For patched mode, deferred refresh is flushed outside timed window each
   iteration (`_flush_pending_deferred_codegen_refresh(...)`) to keep runs
   deterministic while excluding stage-B work from ACK timing.
6. Additional signal: `_refresh_codegen_state(...)` call counts during ACK window.

## Results (local)

| Route | Metric | Legacy Sync | Patched Deferred | Delta |
| --- | --- | ---: | ---: | ---: |
| `move_sections` | latency median | 179.76 ms | 110.74 ms | +38.39% faster |
| `move_sections` | latency p95 | 279.58 ms | 218.51 ms | +21.84% faster |
| `move_sections` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |

## Notes

- This change removes synchronous codegen refresh from the drag ACK path while
  preserving eventual codegen consistency through deferred stage-B refresh.
- The measured median and tail gains are substantial for this high-frequency
  route.
