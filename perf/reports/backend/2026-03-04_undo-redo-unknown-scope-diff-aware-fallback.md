# undo/redo unknown-scope diff-aware fallback transport

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Eliminate unnecessary full code-obj payload fanout during undo/redo when history
entry patch scope is unknown, by deriving fallback transport shape from actual
before/after state differences instead of blindly sending full code-obj +
structural patches.

## Change

`BaseProjectManager.update_and_broadcast_all_project_state(...)` now accepts
`previous_project_state_backend` (undo/redo only) and applies a diff-aware
unknown-scope fallback:

- compare previous vs current single-config state for:
  - project config changes
  - structural changes (`sections`, `sectionVariants`, `sectionImpls`, `parentSectionMap`)
  - code-obj changes (`codeObjs`, `codeObjVariants`, `codeObjImpls`)
- emit only required patch channels:
  - project-config patch only (when config changed and structural did not)
  - code-obj patch only (when code-obj graph changed)
  - structural patch only (when structural graph changed)
  - combined channels only when both dimensions changed
- preserve old conservative behavior when previous backend is unavailable.

This keeps correctness deterministic from source-of-truth state diffs while
avoiding large fallback payloads that are provably unnecessary.

## Tests

- Updated transport assertions in:
  - `tests/project_state/test_structural_patch_transport.py`
    - unknown-scope structural-only fallback now expects structural patch without code-obj patch
    - include-project-config structural history fallback now expects structural-only fallback
- Added regression:
  - `test_undo_redo_unknown_scope_code_obj_changes_still_broadcast_code_obj_patch`

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && pytest tests/project_state/test_structural_patch_transport.py -q`
- `source activate.sh && pytest tests/project_state/test_scoped_history_copy.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_undo_redo_state_normalization.py tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_undo_redo_matrix.py tests/project_state/test_set_callable_undo_redo_stress.py -q`
- `source activate.sh && pytest tests/project_state -q`
- `pnpm -C frontend exec vitest run src/state/actions/undo.test.ts src/utils/workspaceHistory.test.ts src/utils/workspaceHistoryHandoff.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts`

## Benchmarks (local)

Environment:

- `build_callable_project_state(1000)`
- undo/redo unknown-scope entries (`undo_redo_full_patch_fallback=True`)
- one connected in-memory websocket sender capture
- per mode: `3` warmup pairs + `12` measured pairs

### Scenario A: structural-only unknown-scope mutation

Mutation: section name change only.

| Metric | forced full fallback (baseline emulation) | diff-aware fallback | Delta |
| --- | ---: | ---: | ---: |
| Pair median latency | 328.803 ms | 325.051 ms | +1.14% faster |
| Pair p95 latency | 498.502 ms | 500.684 ms | -0.44% |
| Transport bytes (total) | 17,312,697 | 882,513 | ~94.90% lower |
| Transport bytes (median/pair) | 1,442,724 | 73,542 | ~94.90% lower |
| Patch shape | 30 code-obj + 30 structural | 30 structural | code-obj channel eliminated |

### Scenario B: code-obj-only unknown-scope mutation

Mutation: active code-obj name change only.

| Metric | forced full fallback (baseline emulation) | diff-aware fallback | Delta |
| --- | ---: | ---: | ---: |
| Pair median latency | 348.212 ms | 345.725 ms | +0.71% faster |
| Pair p95 latency | 518.481 ms | 495.648 ms | +4.40% faster |
| Transport bytes (total) | 17,300,985 | 16,427,721 | ~5.05% lower |
| Transport bytes (median/pair) | 1,441,748 | 1,368,976 | ~5.05% lower |
| Patch shape | 30 code-obj + 30 structural | 30 code-obj | structural channel eliminated |

## Notes

- This is an architectural fallback correction for unknown-scope undo/redo
  transport; it does not rely on heuristics.
- Scoped history entries continue to use dedicated scoped transport paths.
