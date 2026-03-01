# undo/redo boundary no-op transport skip

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Eliminate redundant project-state transport work when `undo`/`redo` is invoked
at history boundaries (no state transition possible), especially under rapid key-repeat.

## Change

- Added boundary guards in `BaseProjectManager.undo` and `BaseProjectManager.redo`:
  - return immediately when `steps <= 0`
  - return immediately when `history.can_undo(steps)` / `history.can_redo(steps)` is false
- This prevents:
  - unnecessary full snapshot fallback broadcasts
  - unnecessary name-validation broadcast work
  - unnecessary queue-time spent on no-op history navigation requests
- Added regression coverage:
  - `tests/project_state/test_structural_patch_transport.py::test_undo_redo_boundary_noops_skip_transport_broadcasts`

## Validation

- `source activate.sh && pytest tests/project_state/test_structural_patch_transport.py tests/project_state/test_set_callable_undo_redo_stress.py tests/project_state/test_undo_redo_state_normalization.py tests/project_state/test_undo_redo_matrix.py`
- `pnpm -C frontend exec vitest run src/state/actions/undo.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts`

Result: all passed.

## Benchmark scenario

1. Build a callable project state and load it into a real settings manager fixture.
2. Create one extra section to introduce one undoable mutation.
3. Measure two no-op boundary bursts (`60` requests each):
   - lower bound: undo once to boundary, then issue 60 more undo requests
   - upper bound: at latest state, issue 60 redo requests
4. Capture transport calls by wrapping sender methods:
   - `broadcast_project_state`
   - `broadcast_name_validation_errors`
   - patch transport methods
5. Record total burst wall time in ms.

## Results (local)

| Scenario | Metric | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Undo boundary burst (60 no-op requests) | total wall ms | 17341.51 | 0.97 | -99.99% |
| Undo boundary burst (60 no-op requests) | full snapshot broadcasts | 120 | 0 | -100.00% |
| Undo boundary burst (60 no-op requests) | name-validation broadcasts | 120 | 0 | -100.00% |
| Redo boundary burst (60 no-op requests) | total wall ms | 16486.77 | 0.98 | -99.99% |
| Redo boundary burst (60 no-op requests) | full snapshot broadcasts | 120 | 0 | -100.00% |
| Redo boundary burst (60 no-op requests) | name-validation broadcasts | 120 | 0 | -100.00% |

## Notes

- Baseline emitted `120` broadcasts for `60` requests because two project configs
  were traversed in the test state.
- This is a transport/control-plane optimization only; non-boundary undo/redo
  behavior is unchanged and still uses patch transport.
