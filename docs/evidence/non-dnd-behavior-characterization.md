# Non-DnD Behavior Characterization

## Boundary

This Phase 0 inventory characterizes the portable behavior at source snapshot
`043d3b2e9c69caf99d1246f1408b3ad7194b7864`. It is not an instruction to restore the old
application. Exact source paths are executable metadata in
`packages/workspace/tests/fixtures/interaction-evidence.ts`; the adjacent
`non-dnd-evidence.test.ts` fails if an inventory area or its source attribution disappears.

Application stores, generated contracts, backend calls, domain-specific section kinds, plugin
runtime hooks, global document mutation, and old XYFlow implementation text are excluded. Later
phases must implement the retained outcomes with package-owned serializable contracts and the
document/history boundary in the plan.

## Retained outcomes and deliberate changes

| Area                 | Retained outcome                                                                                                                                                       | Standalone contract and excluded coupling                                                                                                                                                                                                         | Planned owner                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Locking              | A named, capability-gated control changes position-and-size lock state; batch actions touch only sections that need a change.                                          | Lock does not inherit, does not disable host content or selection, and rejects direct move/resize/lock commands specifically. No optimistic backend write or generated capability type survives.                                                  | Phase 3 frame commands            |
| Minimizing           | A named minimize/expand control removes the section's host body while preserving its expanded sizing information.                                                      | Nested child sections remain visible and usable. Fixed dimensions restore exactly; content dimensions resume fitting. The host renderer unmounts, focus restores predictably, and old callable-edge behavior is out of scope.                     | Phase 3 frame and renderer        |
| Fixed/content sizing | Width and height are independently constrained; manual resize of a content-sized axis starts from its measured size; reset returns an eligible axis to content sizing. | Modes are explicit `fixed` and `content`, never overloaded `auto` strings. Pointer and keyboard resize share constraints and optional snapping; one accepted change creates one command/history entry.                                            | Phase 3 sizing kernel             |
| Group overflow       | Switching from growing content to internal scrolling captures a stable measured size first; scrolling consumes wheel input without moving the canvas.                  | Modes are explicit `grow` and `scroll`. The package owns ordering, measurement, and undoable transitions rather than a backend boolean or application freeze state.                                                                               | Phase 3 container layout          |
| Snapping             | Root movement, keyboard movement, and resize use the same workbench-unit spacing, including negative coordinates.                                                      | Movement and resize may choose documented completion/live policies, but cannot use different coordinate spaces. Snapping is a host preference and is independent of grid visibility.                                                              | Phases 1 and 3                    |
| Grid                 | Dot, line, and cross marks keep pan-relative phase and zoom-scaled spacing.                                                                                            | Visibility, pattern, spacing, mark size, color, and snapping are independent. Marks are decorative; no old `snapToGrid && showGridLines` coupling survives.                                                                                       | Phase 1 canvas shell              |
| Viewport gestures    | Pointer pan, wheel pan/zoom, pinch, double-click zoom, middle-button behavior, and temporary activation keys are configurable and bounded.                             | Public upstream components/hooks own substrate mechanics behind one package policy. Gesture ownership and cleanup stay scoped to the workbench; no global application store or fork contract is exposed.                                          | Phase 1 canvas shell              |
| Scroll isolation     | A scrollable host or child region can consume wheel input while it has scroll range without changing the outer viewport.                                               | Package suppression primitives and arbitration replace application CSS conventions. Nested scrolling, drag auto-scroll, and viewport ownership must remain compatible.                                                                            | Phases 1 and 3                    |
| Stacking             | The active or dragged section's top-level ancestor receives a transient lift; persistent order stays bounded and deterministic.                                        | Selection alone never rewrites persistent order. Only explicit bring/send commands alter serialized root order and history; normalization cannot depend on application z-index stores.                                                            | Phase 3 document commands         |
| Smart placement      | An explicit position wins; otherwise creation prefers visible, non-overlapping space and focuses the result at the current zoom.                                       | A pure deterministic TypeScript planner owns placement. Backend measurement requests, returned pan targets, and app-specific creation side effects are excluded.                                                                                  | Phase 3 creation                  |
| Inline naming        | Editing supports trim, synchronous validation, cancel, commit, pending/rejection feedback, rollback, and predictable focus.                                            | Validation uses package rules and documented host hooks, not generated SDK rules or backend-only uniqueness. Rejection cannot silently retain an optimistic invalid title.                                                                        | Phase 3 frame UI                  |
| Selection            | Pointer single/additive selection, partial/full marquee, pane clear, keyboard alternatives, and normalized selection roots are retained.                               | Selection is package/host state, not backend project state, and does not persistently restack sections. Every movement consumer receives ancestor-normalized roots.                                                                               | Phases 1 and 3                    |
| Grouping             | Group/ungroup actions operate on normalized roots and retain relative geometry/order.                                                                                  | Grouping requires a valid shared parent, provides a specific disabled reason otherwise, and creates a generic package section through a host-selected definition. No `Dict` label or backend-owned geometry survives.                             | Phase 3 document commands         |
| Minimap              | The minimap is pannable, clickable, toggleable, side-configurable, preserves current zoom when centering, and reflects selection/style updates without remeasurement.  | Roots are the initial spatial summary; an optional nested summary may consume only the shared geometry index. Application pane offsets, fork stores, and domain swatches are excluded. Equivalent focus/fit controls remain available outside it. | Phase 1 shell, Phase 3 population |
| Toolbar              | Native named controls expose pressed/disabled state, zoom limits, stable ordering, and cleanup.                                                                        | Built-ins and host actions use typed descriptors/placements plus bounded overlay slots. Arbitrary plugin mounting and edge/domain controls are excluded.                                                                                          | Phase 1 canvas shell              |
| Section chrome       | Full, compact, transparent, and headerless presentations preserve selection, keyboard access, lock/minimize state, and a drag/action affordance.                       | Variants are semantic package contracts (`default`, `compact`, `transparent`, `none`), not application section-type checks or copied utility classes. State is never color-only.                                                                  | Phase 3 frame UI                  |
| Accents and tags     | Optional serializable accent/tag values support transient preview, one accepted commit, reset, local section tokens, and minimap refresh.                              | New defaults use in-gamut OKLCH and separate light/dark semantic tokens. Contrast is checked with APCA targets and WCAG 2 compatibility; weighted sRGB mixing, hex-only parsing, and status/focus/selection color reuse are excluded.             | Phase 3 presentation              |
| Appearance           | Light, dark, and system choices resolve live and update package chrome without changing document or host data.                                                         | Resolution is scoped to the workbench root, declares `color-scheme`, and leaves persistence to the host. The package never mutates `document.documentElement`, theme metadata, or application local storage.                                      | Phase 1 theme shell               |

## Cross-cutting characterization notes

- Parameter multi-selection is retained only as generic item-tree evidence: normalize a selected
  item block, retain canonical sibling order, measure one overlay, and emit one accepted command.
  Host item-tree integration is Phase 4 and cannot import the historical parameter model.
- Normalized-root dragging suppresses selected descendants whenever an ancestor is selected. The
  shared geometry index supplies combined bounds; pointer, touch, and keyboard input use the same
  normalized IDs.
- Structural section blocks and grouping require one shared source parent. Mixed-parent input fails
  before an interaction owner or preview is created, with a specific reason.
- Batch keyboard movement uses the same selection block, destination planner, constraints, and one
  completion boundary as pointer/touch movement. It is not a loop of individual section commands.
- Drag-overlay measurement is the combined normalized selection rectangle. dnd-kit may own
  draggable/droppable substrate measurement, but package collision, placeholder, focus/fit, and
  external-drop geometry consume the package geometry index.

## Explicit package-owned types

The current runtime surface owns `WorkspaceDocument`, `WorkspaceSection`, and `WorkspaceProps`.
The Phase 0 testing boundary owns these contracts until later phases promote or replace them:

- coordinate and geometry types: `InteractionPoint`, `InteractionRect`, `ViewportTransform`,
  `DragTransform`, `ScreenPoint`, `ScreenRect`, `WorkspacePoint`, `WorkspaceRect`,
  `MeasuredWorkspaceFrame`, `GeometryRegistration`, `GeometryDropTarget`, and
  `WorkspaceGeometryIndex`;
- selection and hierarchy types: `SectionHierarchySnapshot`, `SelectionBlock`, and
  `SelectionBlockResult`;
- structural movement types: `SectionMoveMode`, `SectionMovePlan`, `SectionMoveDestination`,
  `SectionMoveDecision`, and `AppliedHierarchy`;
- collision and preview types: `ListOrientation`, `CollisionCandidate`,
  `CollisionTrackerState`, `CollisionResolution`, and `SortingPreview`;
- ownership types: `InteractionInput`, `InteractionSurface`, `InteractionOwner`,
  `InteractionOwnershipState`, `InteractionStart`, and `InteractionOwnershipEvent`;
- transient projection types: `RootProjectionInput`, `RootProjectionSnapshot`,
  `RootProjectionChange`, `RootLayoutCommand`, `ViewportCommand`, and
  `TransientRootProjection`; and
- adapter-boundary proof types: `AdapterDndInput`, `AdapterDndEvent`,
  `AdapterDndCompletion`, `AdapterDndCollisionRect`, `AdapterProofDragSession`,
  `AdapterProofDragPreview`, `AdapterProofPreviewResolution`, and `AdapterProofCommand`.

XYFlow and dnd-kit types are adapter implementation details and cannot cross the runtime or testing
declaration boundary. Proof-only React props and diagnostic snapshots do not define future public
product contracts.

## Attribution

This inventory is an independently written behavioral specification. No historical source text is
copied. If a later implementation copies or closely ports historical MIT-licensed implementation
text, it must preserve the relevant notice and identify the source path and snapshot beside the
ported code.
