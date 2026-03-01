# Code-section terminal deferred structural refresh

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce ACK latency for code-section terminal attach routes by removing
synchronous `_refresh_codegen_state(...)` from:

- `set_code_section_attached_terminal(...)`
- `ensure_code_section_attached_terminal_for_run(...)`

## Change

Backend (`base_project_manager.py`):

- Updated `set_code_section_attached_terminal(...)` to use
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`.
- Updated `ensure_code_section_attached_terminal_for_run(...)` to use
  `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`.
- Kept existing route policy:
  - `validate_name_rules=False`
  - `broadcast_name_validation_errors=False`

Tests (`tests/project_state/test_structural_patch_transport.py`):

- Added `test_code_section_terminal_routes_defer_codegen_refresh`.
- Asserts attach/detach and ensure-for-run:
  - do not call `_refresh_codegen_state(...)` synchronously in ACK path,
  - schedule one deferred refresh per operation.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_code_section_attached_terminal.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_code_section_attached_terminal.py -k "code_section_terminal_routes_use_structural_patch_transport or code_section_terminal_routes_defer_codegen_refresh or ensure_attached_terminal_for_run_sets_concrete_height or attach_and_detach_terminal or move_sections_defers_codegen_refresh or group_and_ungroup_defer_codegen_refresh" -q`

Result:

- Ruff: passed
- Targeted backend tests: `6 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Method:

1. Created one code section + one terminal section.
2. Measured routes:
   - `set_code_section_attached_terminal` attach
   - `set_code_section_attached_terminal` detach
   - `ensure_code_section_attached_terminal_for_run` (from detached state)
3. Modes:
   - `legacy_sync` (emulated): monkeypatch
     `_merge_and_broadcast_structural_patch_with_deferred_codegen_refresh(...)`
     to call `_update_and_broadcast_structural_patch(...)`.
   - `patched_deferred`: native helper behavior.
4. Iterations: `3` warmup + `12` measured.
5. ACK metric: route call + `finish_pending_operations(...)`.
6. Patched mode flushes deferred refresh outside timed ACK window using
   `_flush_pending_deferred_codegen_refresh(...)`.
7. Additional signal: ACK-window `_refresh_codegen_state(...)` call counts.

## Results (local)

| Route | Metric | Legacy Sync | Patched Deferred | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_code_section_attached_terminal` (attach) | latency median | 288.14 ms | 107.91 ms | +62.55% faster |
| `set_code_section_attached_terminal` (attach) | latency p95 | 318.97 ms | 262.60 ms | +17.67% faster |
| `set_code_section_attached_terminal` (attach) | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `set_code_section_attached_terminal` (detach) | latency median | 178.29 ms | 111.01 ms | +37.74% faster |
| `set_code_section_attached_terminal` (detach) | latency p95 | 328.68 ms | 223.66 ms | +31.95% faster |
| `set_code_section_attached_terminal` (detach) | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |
| `ensure_code_section_attached_terminal_for_run` | latency median | 220.20 ms | 152.31 ms | +30.83% faster |
| `ensure_code_section_attached_terminal_for_run` | latency p95 | 386.97 ms | 296.15 ms | +23.47% faster |
| `ensure_code_section_attached_terminal_for_run` | ACK refresh calls (total, 12 iters) | 12 | 0 | -100.00% |

## Notes

- Deferred schedule deltas for measured ops were exactly `12` each for attach,
  detach, and ensure in patched mode.
- Overall patched benchmark loop scheduled `61` deferred refreshes because it
  also includes unmeasured detach reset/setup operations between measured calls.
