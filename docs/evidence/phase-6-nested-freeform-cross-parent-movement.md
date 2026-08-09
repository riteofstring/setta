# Phase 6 Nested-Freeform Cross-Parent Movement Evidence

## Result and scope

Interactive structural movement can now enter or leave an ordered or freeform container at any
measured depth. Pointer and touch use one collision state across both destination kinds, while
keyboard structural movement exposes the same freeform destinations. Every accepted freeform
target resolves the selected block into exact destination-local positions before host validation,
preview, and completion.

This completes the cross-parent target-resolution and coordinate-conversion slice of the remaining
Phase 6 nested-freeform batch. Freeform-aware grouping and ungrouping, paste and external-drop
placement, the named ordered/freeform positioning control, the complete performance/browser
matrix, and the final Phase 6 audit remain downstream.

## Collision and coordinate ownership

Ordered child regions and freeform surfaces now participate in one package-owned collision
candidate set. The existing previous-target memory, previous-rectangle retention, directional
hysteresis, stale-target clearing, and deepest-valid-child promotion therefore apply across layout
boundaries instead of resetting when the destination kind changes. Self and descendant freeform
regions join the existing invalid-target path and retain the same visible reason and polite
announcement as ordered regions.

Freeform regions retain their owning surface element as well as captured client and workbench
geometry. Each preview refreshes those rectangles through the current outer XYFlow viewport, so a
native scroll in any intervening container does not leave destination geometry stale. No nested
XYFlow viewport, second geometry index, or second culling owner was introduced.

The destination-position helper uses the measured selected-block rectangle and each root's
workbench rectangle to preserve relative offsets. It converts that block through the destination
surface's current workbench origin, snaps the active root in local coordinates, and translates the
complete block together when either local start edge would become negative. The helper returns the
exact global spatial indicator derived from those local positions; host validation, the displayed
preview, and completion all retain that same immutable plan.

## Pointer, touch, keyboard, and application

The existing dnd-kit structural owner calls the unified collision resolver for pointer and
long-press touch input. A freeform collision produces a spatial destination outline rather than an
ordered insertion line. Same-parent freeform movement keeps its captured activation origin while
using refreshed regions for hit testing; cross-parent movement uses the destination conversion
helper. Ordered targets continue through the existing insertion planner.

In sort mode, arrow keys still position a freeform child locally. In free mode, keyboard movement
now considers measured freeform surfaces alongside ordered regions and the root canvas. A chosen
freeform destination centers the measured block in the region, preserves the roots' measured
offsets, then applies the same local snap and edge-translation rules as pointer movement. A
same-parent freeform surface is omitted when every selected root already belongs to it, while a
mixed-source selection may still converge atomically there.

The framework-neutral reducer proof moves between freeform parents while removing every old
position key and installing exactly one validated destination position per moved root. Existing
canonical application consequently covers canvas-to-freeform, freeform-to-canvas,
ordered-to-freeform, freeform-to-ordered, and freeform-to-freeform movement without a compatibility
path or placement guess.

Native movement buttons, activation keys, cancellation, one-command completion, live-region
announcements, and focus restoration remain unchanged. No new custom role or keyboard-only
interaction was added.

## Playground and visual proof

The backend-free nested-freeform workflow now reparents one section from a freeform parent to the
canvas with keyboard input, then uses pointer movement for canvas-to-freeform,
freeform-to-ordered, and ordered-to-freeform transitions. It asserts the exact controlled-change
count, canonical parents, destination-local positions, restored native-handle focus, and Axe after
the sequence. Framework-neutral tests cover the remaining freeform-to-freeform application and
multi-root coordinate preservation without expanding the browser selector into a workflow matrix.

The new cross-parent preview baseline was inspected at its original 1,152 by 704 resolution. It
shows the selected nested section, dashed freeform spatial destination, and named movement overlay
without an ordered insertion marker. The destination remains legible without relying on color
alone, and the existing focus and native controls remain visible.

The recorded in-app-browser release gate remains unavailable and was not retried. No GUI,
extension, credential, remote access, or background service was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; the focused
Playwright Chromium baseline was inspected at original resolution).

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 were used.
- Focused Vitest coverage passes 53 tests across freeform coordinate conversion, unified collision,
  keyboard targeting, and immutable move application. It includes scroll-refreshed region geometry,
  snapping, complete-block clamping, cross-kind ancestor promotion, freeform-to-freeform position
  replacement, and a measured keyboard destination.
- The directly affected nested-freeform Chromium workflow passes canvas, ordered, and freeform
  transitions, exact controlled publication, restored focus, Axe, and the inspected spatial-preview
  baseline. The complete six-test nested-freeform selector also remains green for pointer, touch,
  local keyboard movement, nested scrolling, outer zoom, 200% page scale, 320-CSS-pixel reflow, and
  reduced motion.
- Changed-file quality passes repository boundaries, dependency policy, formatting, lint and
  complexity, file lengths, strict types, dead-code analysis, unit and boundary tests, plan-loop
  automation, builds, exact tarball contents, documentation links, and the declaration report.
- The unrelated tarball-installed consumer passes lockfile policy, strict TypeScript, production
  build, and runtime verification through declared package exports.
- No manifest, lockfile, dependency, lifecycle-script allowlist, trust policy, or exception changed.
  Deterministic dependency checks remain assigned to changed-file quality, so the network-backed
  supply-chain audit was not duplicated.

## Remaining repository-actionable work

Freeform-aware grouping and ungrouping are next: derive exact local positions when a group is
created inside a freeform parent and when children are promoted out of a freeform group, preserving
canonical order and leaving no stale keys. Paste and external-drop placement, the named positioning
control, performance evidence, the representative cross-layout browser matrix, and the final Phase
6 audit follow that command-level ownership work.
