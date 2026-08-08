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

## Final Phase 0 owner and DnD matrix audit

The final adapter audit found no residual Phase 0 owner or section-DnD behavior cell. Coverage is
split intentionally between deterministic package-kernel tests and representative trusted browser
paths:

| Matrix area                                                                                                                              | Executable evidence                                                                                  | Audit result                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas, sorting-root, free-move-root, nested-section, item, host-content, and viewport-override activation                               | `interaction-owner.test.ts` runs every surface for pointer, touch, and keyboard input                | Every start resolves to exactly one owner or an explicit no-owner result; disabled layout, structure, and item capabilities disable their competing activators for all three inputs |
| Runtime mode changes, cancellation, completion, and second-owner rejection                                                               | `interaction-owner.test.ts` plus the adapter ownership browser workflows                             | The captured owner is stable until cancel or complete, a second owner fails specifically, and no canceled gesture emits a command                                                   |
| Sorting and free movement; single and canonical sibling blocks                                                                           | `interaction-planning.test.ts`, `adapter-proof-drag-planning.test.ts`, and adapter browser workflows | Plans and trusted adapter completion use the same package-owned destination and produce at most one accepted command                                                                |
| Canvas-to-nested, nested-to-canvas, nested-to-nested, empty-container, and invalid descendant or parent targets                          | `interaction-planning.test.ts` and `adapter-proof-drag-planning.test.ts`                             | Every parent transition is deterministic; invalid, canceled, unchanged, and host-rejected outcomes cannot partially mutate the hierarchy                                            |
| Vertical and horizontal midpoint transitions, child promotion, hysteresis, stale-target clearing, and preview transforms                 | `interaction-collision.test.ts` and `interaction-planning.test.ts`                                   | Collision state and insertion boundaries remain package-owned and canonical/DOM order stays unchanged during preview                                                                |
| Minimum/default/maximum zoom, selection collision shape, placeholders, canvas coordinates, constrained scroll, and preview/commit parity | `interaction-geometry.test.ts`, `adapter-proof-drag-planning.test.ts`, and adapter browser workflows | Geometry uses one coordinate space at 0.5x/1x/2x, nested scrolling does not leak to the viewport, and the committed key matches the displayed preview                               |
| Public upstream provider and sensor ownership                                                                                            | Trusted pointer, keyboard, and long-press touch adapter browser workflows                            | dnd-kit owns activation, measurement, feedback, overlay, and completion while package planning owns destination semantics; XYFlow and viewport activators do not compete            |

Item-tree behavior beyond the generic selection and ownership fixtures is Phase 4 work, not a
missing Phase 0 section-DnD cell.

## Phase 0 completion

The [upstream adapter proof](upstream-adapter-proof.md) exact-pins the selected dependencies,
records their public adapter and license boundaries, implements the root-node/recursive-DOM
representation, and adds focused geometry, transient-projection, ownership, accessibility, and
browser evidence. The owner/DnD audit has no residual Phase 0 cell, and `perf/` records both the
repeatable 2,000-frame framework-neutral geometry workload and the trusted-browser recursive-root
render baseline.

The [non-DnD inventory](non-dnd-behavior-characterization.md) and
[browser matrix](browser-characterization-matrix.md) now cover every remaining behavior family,
including explicitly absent historical browser scenarios and their later standalone destination.
The [gate audit](phase-0-gate-audit.md) records the repository-actionable Phase 0 disposition.
Interactive CDP review remains a separate unavailable external release gate and does not make a
repository task incomplete.
