# Phase 6 Nested-Freeform Document-Contract Evidence

## Result and scope

The schema-v2 document and static recursive-projection foundation for nested freeform positioning
is implemented. Every child layout now identifies one explicit ordered or freeform positioning
model, production recursive DOM renders freeform children at canonical local coordinates, and one
strict, undoable controller command converts a container between those models.

This is a coherent foundation inside the remaining Phase 6 batch, not completion of that batch.
Same-parent freeform dragging, keyboard spatial movement, snapping, collision and preview planning,
cross-layout reparenting into freeform containers, and the named positioning control remain
repository-actionable. Until those contracts exist, grouping, ungrouping, structural movement, and
external-drop targeting into a freeform parent reject specifically instead of guessing positions.

## Document, command, and ownership boundary

| Boundary               | Implemented contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serialized document    | `WorkspaceDocument` accepts schema version 2 only. `WorkspaceChildLayout` is an explicit `WorkspaceOrderedChildLayout` or `WorkspaceFreeformChildLayout` union. Ordered layouts own `orientation`; freeform layouts own `positions`; both retain `overflow` and canonical `sectionIds`. No discriminator inference, schema-v1 parser, compatibility alias, or migration path was added.                                                                                                                  |
| Freeform invariants    | `positions` is a plain exact object with one own data property for every direct child ID and no others. Each point has exactly finite, non-negative `x` and `y` values. Accessor-backed fields are rejected without evaluation. `sectionIds` continues to own containment, traversal, and persistent sibling stacking order.                                                                                                                                                                             |
| Positioning command    | `WorkspaceController.setSectionChildPositioning` snapshots and strictly resolves either complete local positions for ordered-to-freeform conversion or an orientation for freeform-to-ordered conversion. It preserves direct-child identity, order, overflow, selection, and one `section-positioning` history boundary, requires live `editLayout`, and rejects non-containers, locked or minimized sections, malformed maps, and missing scroll measurements without partial state.                   |
| Existing commands      | Deletion and movement out of a freeform parent remove obsolete position entries atomically. Clipboard cloning remaps position keys to cloned IDs. Root ungrouping can derive positions from measured child frames. Operations that would need a new freeform position but do not yet own local geometry reject with `section-layout-unsupported`; ordered orientation changes reject with `section-layout-not-ordered`.                                                                                  |
| Recursive rendering    | The representation prerequisite's selected package-owned recursive DOM remains beneath one outer XYFlow viewport. Direct freeform children receive absolute wrappers with independent local transforms, while their section frames retain existing dnd-kit transforms. A bounded `ResizeObserver` measures direct wrappers so grow extent includes content-sized descendants; serialized size fallbacks preserve deterministic server markup. Empty freeform containers retain a useful minimum surface. |
| Overflow and targeting | Grow derives both axes from local position plus measured child size. Freeform scroll requires fixed width and height and preserves the measured extent through native overflow. Ordered external-drop targeting skips freeform containers until a local-coordinate candidate contract exists, preventing an ordered insertion index from being mislabeled as a freeform placement.                                                                                                                       |

The package continues to serialize document intent only. Measured wrapper extents, gesture state,
selection, focus, scrolling, and viewport state remain adapter-local. The root XYFlow viewport is
still the sole workbench pan/zoom owner, and the recursive projection adds no inner store, viewport,
or culling owner.

## Public package and integration proof

The core entry point exports the explicit ordered/freeform layout types and positioning-change
contract. The public controller exposes the conversion command without an internal import. The
integration and recursive-section guides document schema version 2, exact position-map ownership,
conversion inputs, two-axis freeform overflow, and the intentionally rejected interaction boundary.

The backend-free playground route `/?canvas-shell&nested-freeform-contract` supplies an ordered
container inside a freeform root plus another freeform container at the next depth. Its serialized
document retains exact local coordinates and canonical order. The unrelated packed consumer imports
`WorkspaceFreeformChildLayout` through `@setta/workspace/core`, validates a schema-v2 document, and
renders a nested freeform child through the declared React entry point.

## Accessibility, layout, and visual evidence

Freeform projection retains the existing native article, button, heading, focus, and action
semantics. The irrelevant ordered-orientation control is absent for a freeform container while an
ordered descendant retains the control. The focused Chromium workflow passes Axe, confirms one
outer `.react-flow__viewport`, verifies DOM ancestry and complete measured surface bounds, and
proves local coordinate deltas remain CSS coordinates at 200% page scale. At 320 CSS pixels the
page has no horizontal overflow and reduced-motion media state remains active.

The inspected original-resolution baseline shows the complete fitted root, three spatially placed
direct children, the deeper freeform child, visible selected-state chrome, populated minimap, and no
surface clipping or second viewport. The browser assertion also requires the fitted root bounds to
remain inside the workspace before accepting the baseline.

The plan's recorded in-app-browser release gate remains unavailable and was not retried. No GUI,
extension, credential, remote access, or unrelated background service was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; the focused
Playwright Chromium nested-freeform baseline was inspected at original resolution).

## Verification boundary

- Focused package coverage passes 118 tests across eight document, React, positioning, orientation,
  overflow, movement, clipboard, and external-drop files.
- Package strict TypeScript, the package build, and playground strict TypeScript pass on the exact
  checked-in toolchain.
- Two directly affected Chromium workflows pass schema-v2 recursive rendering, exact local
  positions, one viewport, ordered-control suppression, measured grow extent, serialization, Axe,
  fitted visual bounds, 200% page scale, reduced motion, and 320-CSS-pixel reflow.
- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passes
  for 55 project files with repository and import boundaries across 344 files, dependency policy,
  formatting, lint and complexity, file lengths, strict package/playground/root types, dead-code
  analysis, 486 unit tests across 47 files, six boundary tests, plan-loop automation, package and
  playground builds, exact tarball contents, documentation links, and the declaration report.
- The unrelated tarball-installed consumer passes exact-file allowlisting, lockfile policy, strict
  TypeScript, production build, and Chromium runtime verification while importing the public
  freeform layout type and rendering its canonical nested position.
- No manifest, lockfile, dependency, lifecycle allowlist, trust policy, or exception changed. The
  deterministic dependency checks remain assigned to changed-file quality, so the network-backed
  supply-chain gate is not duplicated.

## Remaining repository-actionable work

The next coupled implementation starts with same-parent freeform spatial movement and the local
coordinate/preview contract needed by pointer, touch, and keyboard input. It then enables freeform
destinations for structural movement, grouping, ungrouping, paste, and external drops without
weakening the exact position-map invariant. The positioning control, complete cross-layout browser
matrix, performance record, and final batch audit remain downstream of those interaction contracts.
