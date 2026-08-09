# Phase 6 Nested-Freeform Local-Movement Evidence

## Result and scope

Same-parent freeform section movement is implemented as one local-coordinate layout operation for
pointer, touch, and keyboard input. It updates only the moved direct-child positions, preserves
canonical `sectionIds` and selected-block offsets, snaps against the package grid, and translates
the complete block when either local start edge would be crossed.

This completes the local-movement slice of the remaining Phase 6 nested-freeform batch. It does
not complete interactive cross-parent freeform targeting, grouping or ungrouping inside a
freeform parent, external-drop placement, or the named ordered/freeform positioning control.

## Plan, command, and reconciliation contract

`SectionMovePlan` now owns one explicit discriminated destination:

```ts
type SectionMoveDestination = {
  parentId: string | null;
  placement:
    | { type: "ordered"; index: number }
    | { type: "freeform"; positions: Readonly<Record<string, WorkspacePoint>> };
};
```

The removed flat destination index, parent, and root-position fields have no alias or compatibility
path. Ordered plans retain one insertion index. Canvas and nested freeform plans retain exactly one
position for each moved normalized root. Nested positions are finite and non-negative; root canvas
positions remain arbitrary finite workbench coordinates. Serialization, equality, immutable host
validation, layout preview, announcements, public exports, playground integration, consumer use,
adapter proof, and affected end-to-end assertions all use the discriminated contract.

Same-parent freeform application preserves the parent's persistent back-to-front `sectionIds` and
unmoved positions. Movement out prunes source position keys, and explicit framework-neutral entry
into a freeform parent appends the moved roots in deterministic stacking order and installs their
validated local positions. Controlled reconciliation compares the exact hierarchy, root positions,
and every freeform position map projected from the source document while allowing unrelated host
data changes.

Same-parent freeform positioning is an `editLayout` operation. It remains available when
`editStructure` is false; ordered sorting and cross-parent movement continue to require structure
editing. Locked or detached selections, placement/layout mismatches, missing measurements, invalid
maps, host rejection, and controlled rejection fail specifically without publishing a partial
document.

## React interaction and geometry ownership

The existing named movement handle and dnd-kit boundary remain the single pointer, touch, and
keyboard owner. In sort mode an ordered child sorts, while a freeform child uses local spatial
positioning. The interaction publishes one displayed immutable plan, one controlled command, one
live-region outcome, and restores the native handle focus after completion or cancellation.

Freeform regions capture the visible client rect and the direct package-owned freeform surface.
Pointer deltas pass through the outer XYFlow viewport transform and subtract the surface's current
workbench displacement from nested native scrolling. This preserves destination-local coordinates
through outer zoom and intervening scroll without introducing an inner XYFlow store, viewport, or
culling owner. Keyboard movement advances the active child to the next local grid line, or by ten
local units when snapping is disabled, and cumulative previews retain the selected block's offsets.

Preview feedback uses a spatial placeholder rather than an ordered insertion marker. The DOM
identifies `ordered` versus `freeform` destination placement, freeform previews omit an insertion
index, drag overlays say “Positioning,” and polite announcements name the destination container and
resulting local coordinates. Native button semantics, activation keys, focus restoration, visible
focus, coarse-pointer ownership, reduced motion, 200% page scale, 320-CSS-pixel reflow, and Axe
coverage remain on the existing accessibility path.

Post-batch supervision corrected two projection details before cross-parent targeting built on this
slice. Ordered and freeform child regions now retain the same keyed surface and placement elements;
ordered wrappers use `display: contents`, while freeform wrappers own their local positioning. A
positioning switch can therefore preserve the mounted host renderer, its React state, and focused
descendants instead of replacing the subtree solely because its parent layout changed. During a
freeform preview, every freeform placement on the active descendant path receives a transient local
stack lift, keeping single- and multi-section feedback above later siblings without changing the
canonical `sectionIds` stacking order.

## Playground, consumer, and visual proof

The backend-free `/?canvas-shell&nested-freeform-contract` route now uses a fixed scrollable
freeform root. It demonstrates pointer, touch, and keyboard movement, grid snapping, one controlled
change per completion, native nested scrolling during an active gesture, outer 2× canvas zoom,
exact serialization, and one outer `.react-flow__viewport`. The unrelated packed consumer compiles
its host move policy against `plan.destination.parentId` through declared exports only.

The static nested-freeform and active freeform-positioning baselines were inspected at original
resolution. The movement baseline shows the spatial destination outline, transient frame
projection, and “Positioning Nested Alpha” overlay without a sibling insertion marker. The existing
ordered movement actual also received a bounded expected/actual/diff inspection; its stable
1,704-pixel render-only delta did not change geometry, content, or interaction state, and the
inspected current actual was adopted as the baseline. In accordance with the loop's repeated-failure
rule, that exact ordered screenshot selector was not invoked a third time after the baseline update.

The recorded in-app-browser release gate remains unavailable and was not retried. No GUI,
extension, credential, remote access, or unrelated background service was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; focused
Playwright Chromium baselines were inspected at original resolution).

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 were used. The system
  Corepack launcher failed before execution, so all authorized repository checks used the checked-in
  launcher rather than changing the environment.
- Focused Vitest coverage passes 112 tests across eight planner, reducer, adapter-proof, static
  React, positioning, collision, keyboard, and local-movement files.
- The five-test nested-freeform Chromium selector passes pointer, touch, keyboard, controlled
  commits, focus restoration, local snapping, a scroll change during an active drag, 2× outer zoom,
  200% page scale, 320-CSS-pixel reflow, reduced motion, Axe, and both inspected baselines.
- The post-batch focused selector passes all five nested-freeform workflows plus the directly
  affected ordered structural-preview workflow. It asserts the active freeform placement's stack
  lift, and the regenerated original-resolution movement baseline shows the complete active frame
  above the later sibling. Static React coverage verifies the shared ordered/freeform surface and
  placement topology.
- The directly affected keyboard canvas-promotion selector passes with the new freeform destination
  discriminant and no obsolete destination index.
- The unrelated tarball-installed consumer passes exact-file allowlisting, lockfile policy, strict
  TypeScript, production build, and runtime verification after the three new internal build modules
  were added to the exact package allowlist.
- Changed-file quality passes for 42 project files with repository boundaries across 350 files,
  dependency policy, formatting, lint and complexity, file lengths, strict package/playground/root
  types, dead-code analysis, 495 unit tests across 48 files, six boundary tests, plan-loop
  automation, package and playground builds, exact tarball contents, documentation links, and the
  declaration report.
- No manifest, lockfile, dependency, lifecycle-script allowlist, trust policy, or exception changed.
  Deterministic dependency checks remain assigned to changed-file quality, so the network-backed
  supply-chain audit is not duplicated.

## Remaining repository-actionable work

Interactive freeform destination resolution is next: convert a moved block into each destination's
local coordinates, retain target hysteresis and ancestor promotion, and cover ordered-to-freeform,
freeform-to-ordered, freeform-to-freeform, and root transitions for single- and mixed-source blocks.
Grouping, ungrouping, paste and external-drop placement, the named positioning control, performance
evidence, the representative cross-layout browser matrix, and the final Phase 6 audit remain
downstream.
