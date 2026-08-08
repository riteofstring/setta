# Interaction Characterization Matrix

## Decision boundary

These Phase 0 fixtures define framework-neutral outcomes that the later XYFlow and dnd-kit adapters must preserve. They are tied to source snapshot `043d3b2e9c69caf99d1246f1408b3ad7194b7864`, use only package-owned types, and are exported through `@setta/workspace/testing` rather than the runtime API.

The implementation is an independently written behavioral characterization. No historical source text was copied. The historical MIT notices remain relevant if later adapter work copies or closely ports implementation text.

## Source-to-fixture map

| Fixture group                  | Historical behavior evidence                                            | Package-owned executable evidence                                | Characterized outcomes                                                                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scaled geometry                | `adapter/zoom.ts`, `dragRectBounds.ts`, `DragOperationShapeSync.tsx`    | `interaction-geometry.ts`, `interaction-geometry.test.ts`        | Minimum/default/maximum zoom normalization, screen/workspace round trips, negative coordinates, combined selection bounds, missing-rectangle failure, and deterministic transform serialization                                                             |
| Selection roots                | `sectionSelection.ts`, `useDropType.ts`                                 | `selection-planning.ts`, `interaction-planning.test.ts`          | Ancestor suppression, canonical sibling order, deterministic spatial root order, shared-parent enforcement, generic item-block normalization, and combined item overlay bounds                                                                              |
| Collision and target stability | `adapter/collision.ts`, `adapter/collisionCompare.ts`, `useDropType.ts` | `collision-characterization.ts`, `interaction-collision.test.ts` | Sortable priority, signed trigger-distance ranking, overlap tie-breaking, previous-target preference, previous-rectangle retention, vertical/horizontal midpoint buffers, nested child promotion, and stale-target clearing                                 |
| Layout-stable preview          | `adapter/sorting.ts`, `sortingOverState.ts`                             | `sorting-preview.ts`, `interaction-planning.test.ts`             | Orientation-aware insertion thresholds, unchanged DOM order during preview, active translation, and displaced-sibling translation                                                                                                                           |
| Move planning                  | `useMoveSectionPlans.ts`, `useMoveSection.ts`, `sectionSelection.ts`    | `section-move-planning.ts`, `interaction-planning.test.ts`       | Sort and free modes, single and sibling-block plans, canvas-to-nested, nested-to-canvas, nested-to-nested, empty-container insertion, relative top-level offsets, no-op detection, cycle rejection, cancellation, host rejection, and immutable application |
| Interaction ownership          | `useDropType.ts`, `selectionDragHandle.ts`, `ZoomPane.tsx`              | `interaction-owner.ts`, `interaction-owner.test.ts`              | Exactly one owner for viewport, root-layout, section-structure, and item-tree movement; pointer/touch/keyboard parity; capability gating; viewport override; host-content exclusion; cancellation; completion; and runtime mode changes                     |

The test fixture metadata in `packages/workspace/tests/fixtures/interaction-evidence.ts` makes the source paths and independent-reimplementation attribution executable rather than relying only on this document.

## Coordinate and state contracts

- Screen deltas are divided by one positive finite viewport zoom before they become workspace translations.
- Screen/workspace conversion includes both viewport translation and zoom and is reversible for negative coordinates.
- Collision rectangles, pointer coordinates, and the ten-CSS-pixel midpoint buffer use one screen-coordinate space. A later adapter must not mix them with workspace coordinates.
- A selected ancestor suppresses its selected descendants before bounds, collision, preview, or movement planning.
- The selected block has one source parent. Mixed-parent batch movement fails before an interaction owner is activated.
- Nested blocks follow canonical sibling order. Top-level blocks follow `y`, then `x`, then persistent root stacking order, then stable ID.
- Collision state is explicit input and output. An empty candidate frame clears the retained target so stale parent or insertion state cannot reach commit.
- Preview and commit consume the same destination parent and index. Preview transforms do not reorder canonical or DOM input arrays.
- Applying a move plan returns a new hierarchy and does not mutate its input.
- An active interaction retains its one owner through runtime mode changes; cancellation and completion release ownership without selecting a competing owner mid-gesture.

## Phase 0 limits still open

This batch does not select or prove an upstream dependency. Phase 0 still requires:

- Exact-pinned stable XYFlow and dnd-kit dependencies, adapter boundaries, public-API/store-access decisions, licensing confirmation, and differential evidence against upstream behavior.
- Browser proof for scaled ancestors, nested scrolling, focus/scroll coordination, geometry registration, preview/commit parity, touch and keyboard workflows, accessibility, and visual behavior.
- Transient-projection and one-command/one-history-entry integration proof.
- The complete non-DnD behavior inventory, browser characterization matrix, performance baselines, and registry-backed loaded-lockfile, trust, and vulnerability evidence.

Unavailable external evidence does not change the completion state of these remaining repository and adapter tasks.
