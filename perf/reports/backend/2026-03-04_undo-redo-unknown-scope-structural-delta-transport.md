# undo/redo unknown-scope structural-delta transport

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce topology-changing unknown-scope undo/redo transport payloads by avoiding
full structural snapshots when previous/current single-config state is already
available for deterministic diffing.

## Change

`BaseProjectManager.update_and_broadcast_all_project_state(...)` now sends
structural **delta** payloads for unknown-scope undo/redo topology changes:

- added deterministic map-diff helper for structural collections:
  - `sections`
  - `sectionVariants`
  - `sectionImpls`
  - `parentSectionMap`
- new structural patch payload fields:
  - `isFullSnapshot`
  - `removedSectionIds`
  - `removedSectionVariantIds`
  - `removedSectionImplIds`
  - `removedParentSectionIds`
- unknown-scope topology fallback now emits:
  - upserts for changed/added entries only
  - explicit removed-id lists for deleted entries
  - full `projectConfig` plus revision ordering semantics unchanged
- frontend structural patch apply path now supports both:
  - full snapshot replacement (`isFullSnapshot !== false`)
  - delta merge/remove (`isFullSnapshot === false`)

Revision mismatch behavior is unchanged: websocket handler still forces a full
resync when patch revisions do not line up.

## Tests

Backend:

- updated `tests/project_state/test_structural_patch_transport.py`
  - unknown-scope structural fallback now asserts delta metadata (`isFullSnapshot=False`)
  - include-project-config structural undo/redo asserts removal metadata on undo

Frontend:

- updated `frontend/src/state/actions/sectionInfos.test.ts`
  - added structural-delta apply test (upserts + removals)
  - added structural-delta rejection test for invalid variant references

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py backend/setta/project_state/project_manager_types.py backend/setta/websockets/msg_handlers/frontend_sender.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && pytest tests/project_state/test_structural_patch_transport.py -q`
- `source activate.sh && pytest tests/project_state -q`
- `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/websocketReceive.test.ts`
- `pnpm -C frontend exec vitest run src/state/actions/undo.test.ts src/utils/workspaceHistory.test.ts src/utils/workspaceHistoryHandoff.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts`

## Benchmark (local)

Environment:

- `build_callable_project_state(1000)`
- unknown-scope history entry (`undo_redo_full_patch_fallback=True`)
- topology-changing mutation: one section-core name update
- `3` warmup pairs + `12` measured pairs
- pair = `undo(steps=1)` + `redo(steps=1)`

| Metric | forced full structural fallback (baseline emulation) | structural-delta transport | Delta |
| --- | ---: | ---: | ---: |
| Pair median latency | 299.521 ms | 308.295 ms | -2.93% |
| Pair p95 latency | 445.895 ms | 560.179 ms | -25.63% |
| Transport bytes total | 887,040 | 103,944 | ~88.28% lower |
| Transport bytes median/pair | 73,920 | 8,662 | ~88.28% lower |
| Patch shape | 30 full structural | 30 structural delta (`isFullSnapshot=false`) | full snapshots eliminated |

## Notes

- This change is transport-architectural: it reduces websocket payload volume
  without relying on heuristic scope inference.
- Local latency variance was noisy in this synthetic run, but payload-size
  reduction is large and deterministic.
