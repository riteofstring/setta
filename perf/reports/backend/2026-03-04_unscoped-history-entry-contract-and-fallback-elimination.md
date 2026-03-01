# unscoped history-entry contract + implicit fallback elimination

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Remove accidental undo/redo full-payload fallbacks by making unscoped
project-config history entries explicit, while preserving an explicit fallback
escape hatch for correctness.

## Change

`BaseProjectManager` history entry scope now enforces explicit intent:

- Added `undo_redo_full_patch_fallback` to `add_new_history_entry(...)`.
- Unscoped project-config history entries (`project_config_id` with no scope
  args) now raise `ValueError` unless `undo_redo_full_patch_fallback=True` is
  provided.
- Added validation that `undo_redo_full_patch_fallback` can only be used with
  that exact unscoped project-config shape.

Helper fallback changes to eliminate implicit unknown scope in production paths:

- `_add_param_tree_scoped_history_entry(...)`
  - now always includes section scope (`section_id` + codegen singleton sections)
  - no longer falls back to unscoped history when code-obj scope is empty.
- `_add_section_and_code_obj_scoped_history_entry(...)`
  - empty resolved scope now explicitly uses `project_config_only=True`
    instead of unscoped fallback.

Test updates:

- tests that intentionally use full fallback now set
  `undo_redo_full_patch_fallback=True` explicitly.
- added regression guard:
  - `test_unscoped_project_config_history_entry_requires_explicit_full_fallback`

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_scoped_history_copy.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_undo_redo_state_normalization.py`
- `source activate.sh && pytest tests/project_state/test_scoped_history_copy.py tests/project_state/test_undo_redo_state_normalization.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_undo_redo_matrix.py tests/project_state/test_set_callable_undo_redo_stress.py -q`
- `source activate.sh && pytest tests/project_state -q`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts`

## Benchmark Scenario

Measured transport impact of explicit scoped history vs explicit full fallback on
identical synthetic state (`build_callable_project_state(1000)`), with one
connected in-memory frontend websocket.

Method:

1. Seed a single history mutation that changes project config name.
2. Compare modes:
   - `explicit_full_fallback`: `undo_redo_full_patch_fallback=True`
   - `project_config_only_scoped`: `project_config_only=True`
3. Per mode: `3` warmup undo/redo pairs + `12` measured pairs.
4. Record pair latency, payload bytes, and transport message shape.

## Results (local)

- Pair median latency:
  - full fallback: `170.657 ms`
  - scoped: `158.928 ms`
  - improvement: `+6.87%`
- Pair p95 latency:
  - full fallback: `216.853 ms`
  - scoped: `261.707 ms`
  - delta: `-20.68%` (short-run local noise)
- Transport bytes:
  - full fallback: `17,319,120`
  - scoped: `96,744`
  - improvement: `~99.44%`

Transport shape per `24` navigation calls:

- full fallback: `24 structural + 24 code-obj patches`
- scoped: `24 project-config patches`

## Notes

- This step is primarily architectural hardening: accidental unscoped full
  fallback is now rejected at the history-entry boundary.
- Explicit full fallback remains available for intentional/correctness-critical
  cases via `undo_redo_full_patch_fallback=True`.
