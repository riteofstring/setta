# Current Setta Interaction-Kernel Evidence

## Source snapshot

- Source commit: `043d3b2e9c69caf99d1246f1408b3ad7194b7864`
- Source branch at capture time: `main`
- New implementation branch: `workspace-blank-slate`

Git history is the source archive. Inspect a referenced file without restoring the old application tree with:

```text
git show 043d3b2e9c69caf99d1246f1408b3ad7194b7864:<path>
```

This manifest records behavioral evidence, not APIs or code that must be copied. Application components, generated types, stores, backend calls, and old dependency adapters are excluded unless a later characterization proves that a small pure algorithm is the clearest new package-owned implementation.

## Section and item drag evidence

| Behavior                                                                                                             | Primary source evidence                                                                                                                      | Executable evidence                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zoom-normalized pointer, rectangle, and overlay geometry                                                             | `frontend/src/forks/dnd-kit/adapter/zoom.ts`, `frontend/src/forks/dnd-kit/dragRectBounds.ts`, `frontend/src/forks/dnd-kit/useDropType.ts`    | `frontend/src/forks/dnd-kit/adapter/zoom.test.ts`, `frontend/src/forks/dnd-kit/adapter/rect.test.ts`, `frontend/src/forks/dnd-kit/DragOperationShapeSync.test.ts`                     |
| Collision ranking, child-over-parent promotion, and deterministic over resolution                                    | `frontend/src/forks/dnd-kit/adapter/collision.ts`, `frontend/src/forks/dnd-kit/adapter/collisionCompare.ts`                                  | `frontend/src/forks/dnd-kit/adapter/collision.test.ts`, `frontend/src/forks/dnd-kit/adapter/collisionCompare.test.ts`, `frontend/src/forks/dnd-kit/dndCollisions.integration.test.ts` |
| Previous-target retention, midpoint transitions, trigger-distance behavior, stale-target clearing, and preview state | `frontend/src/forks/dnd-kit/useDropType.ts`, `frontend/src/forks/dnd-kit/sortingOverState.ts`                                                | `frontend/src/forks/dnd-kit/useDropType.test.ts`, `frontend/src/forks/dnd-kit/sortingOverState.test.ts`                                                                               |
| Sorting and free-move plan construction                                                                              | `frontend/src/forks/dnd-kit/useMoveSectionPlans.ts`, `frontend/src/forks/dnd-kit/useMoveSection.ts`                                          | `frontend/src/forks/dnd-kit/useMoveSectionPlans.test.ts`                                                                                                                              |
| Ordered child relationships and cycle-sensitive nesting                                                              | `frontend/src/forks/dnd-kit/dndChildren.ts`, `frontend/src/forks/dnd-kit/paramDndChildren.ts`                                                | `frontend/src/forks/dnd-kit/dndChildren.test.ts`, `frontend/src/forks/dnd-kit/paramDndChildren.test.ts`                                                                               |
| Section and parameter multi-selection drag state                                                                     | `frontend/src/forks/dnd-kit/dndState.ts`, `frontend/src/forks/dnd-kit/paramDndState.ts`, `frontend/src/forks/dnd-kit/selectionDragHandle.ts` | `frontend/src/forks/dnd-kit/dndState.test.ts`, `frontend/src/forks/dnd-kit/paramDndState.test.ts`                                                                                     |
| Layout-stable sortable preview and disabled-state arbitration                                                        | `frontend/src/forks/dnd-kit/adapter/useSortableModel.ts`, `frontend/src/forks/dnd-kit/adapter/sorting.ts`                                    | `frontend/src/forks/dnd-kit/adapter/useSortableModel.test.ts`, `frontend/src/forks/dnd-kit/adapter/sorting.test.ts`                                                                   |

## Canvas behavior evidence

The old XYFlow fork is not an implementation baseline. These files identify outcomes to re-prove through an upstream adapter:

- Viewport gestures and lifecycle: `frontend/src/forks/xyflow/core/container/ZoomPane.tsx` and `ZoomPane.test.ts`.
- Root movement and viewport projection: `frontend/src/forks/xyflow/core/hooks/useDrag.ts`, `useUpdateNodePositions.ts`, and `useViewportHelper.ts`.
- Marquee and selection overlay behavior: `frontend/src/forks/xyflow/core/components/UserSelection.tsx` and `NodesSelection.tsx`.
- Minimap rendering and subscription behavior: `frontend/src/forks/xyflow/minimap/MiniMap.tsx`, `MiniMapNodes.tsx`, and their tests.
- Background and controls behavior: `frontend/src/forks/xyflow/background/` and `frontend/src/forks/xyflow/controls/`.

Representative application-level outcomes are covered by:

- `frontend/tests/e2e/sections/nested-marquee-selection.spec.ts`
- `frontend/tests/e2e/sections/multi-selection-drag.spec.ts`
- `frontend/tests/e2e/sections/section-sizing.spec.ts`
- `frontend/tests/e2e/sections/minimap-selection-persistence.spec.ts`
- `frontend/tests/e2e/sections/pane-click-deselect-persists.spec.ts`
- `frontend/tests/e2e/editor/viewport-sync.spec.ts`

## Required characterization destinations

Before the corresponding old source is treated as replaceable, the new package must have framework-neutral fixtures and tests for:

- Zoom scaling at minimum, default, and maximum supported zoom.
- Ambiguous parent/child and sibling collision ranking.
- Previous-target hysteresis and stale-target clearing.
- Vertical and horizontal midpoint transitions.
- Single-section and normalized sibling-block moves.
- Canvas-to-nested, nested-to-canvas, and nested-to-nested plans.
- Empty-container insertion, invalid descendant targets, cancellation, and host rejection.
- Multi-item selection normalization, stable order, and overlay bounds.
- Single-owner arbitration among canvas pan, root movement, section structural movement, and item movement.

The initial framework-neutral destination is now executable. See
`docs/evidence/interaction-characterization-matrix.md` for the source-to-fixture
mapping, coordinate and state contracts, covered scenarios, and the remaining
upstream/browser proof boundary. Fixture metadata is also checked in
`packages/workspace/tests/fixtures/interaction-evidence.ts`; focused tests live in
the adjacent `interaction-*.test.ts` files.

The final Phase 0 owner and section-DnD audit is recorded in that matrix. It exercises every owner
surface for pointer, touch, and keyboard input and maps the required sorting, free-move,
selection-block, transition, invalid-target, orientation, cancellation, scrolling, and zoom cells
to deterministic or trusted-browser evidence. No residual Phase 0 interaction-kernel cell remains;
item-tree integration itself stays deferred to Phase 4.

The remaining application behavior is characterized without restoring its source tree in
`docs/evidence/non-dnd-behavior-characterization.md`. Historical browser coverage, known absences,
current independent proof, and each later-phase destination are mapped in
`docs/evidence/browser-characterization-matrix.md`. Together with the explicit gate audit, these
records complete the repository-actionable Phase 0 evidence boundary.

## License and attribution boundary

The captured XYFlow and dnd-kit fork directories each contain an MIT `LICENSE`. Preserve copyright and license notices for any source-derived implementation. Behavioral reimplementation from independently written specifications should still retain this manifest, while copied or closely ported code must identify its source path and commit beside the new implementation and in the third-party attribution record.
