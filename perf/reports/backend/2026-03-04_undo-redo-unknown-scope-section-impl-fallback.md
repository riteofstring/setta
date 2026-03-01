# undo/redo unknown-scope section-impl fallback transport

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Further reduce unknown-scope undo/redo transport by avoiding full structural
fallback when topology is unchanged and only section impl payloads differ.

## Change

Enhanced unknown-scope undo/redo diff planning in
`BaseProjectManager`:

- Replaced boolean-only unknown-scope diff helper with a patch-plan helper:
  - `project_config_changed`
  - `topology_changed`
  - `code_obj_changed`
  - `changed_section_impl_ids`
- `topology_changed` is now limited to true structural graph differences:
  - `sections`, `sectionVariants`, `parentSectionMap`, and
    `projectConfig.sectionVariantMap`
- When topology is unchanged, changed section impls are now emitted via
  `section_impl` patch channel instead of full structural patch fallback.

Fallback order for unknown scope now becomes:

1. project-config patch (when changed and topology unchanged)
2. code-obj patch (when changed)
3. section-impl patches (when topology unchanged and impls changed)
4. structural patch only when topology changed

## Tests

Updated `tests/project_state/test_structural_patch_transport.py`:

- Added `test_undo_redo_unknown_scope_section_impl_changes_use_section_impl_patch`.
- Existing unknown-scope structural and code-obj regressions remain in place.

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && pytest tests/project_state/test_structural_patch_transport.py -q`
- `source activate.sh && pytest tests/project_state/test_scoped_history_copy.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_undo_redo_state_normalization.py tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_undo_redo_matrix.py tests/project_state/test_set_callable_undo_redo_stress.py -q`
- `source activate.sh && pytest tests/project_state -q`
- `pnpm -C frontend exec vitest run src/state/actions/undo.test.ts src/utils/workspaceHistory.test.ts src/utils/workspaceHistoryHandoff.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts`

## Benchmark (local)

Environment:

- `build_callable_project_state(1000)`
- unknown-scope history entry (`undo_redo_full_patch_fallback=True`)
- section-impl-only mutation (toggle `selectedParams` on active callable section)
- one websocket sender capture
- `3` warmup pairs + `12` measured pairs

| Metric | forced structural fallback (baseline emulation) | section-impl diff fallback | Delta |
| --- | ---: | ---: | ---: |
| Pair median latency | 312.699 ms | 324.650 ms | -3.82% |
| Pair p95 latency | 458.661 ms | 455.957 ms | +0.59% faster |
| Transport bytes total | 878,520 | 780,000 | ~11.21% lower |
| Transport bytes median/pair | 73,210 | 65,000 | ~11.21% lower |
| Patch shape | 30 structural | 30 section-impl | structural channel eliminated |

## Notes

- This is an architectural refinement of unknown-scope fallback planning.
- Scoped history entries remain unchanged and still use their dedicated scoped
  transport paths.
