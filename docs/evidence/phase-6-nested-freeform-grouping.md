# Phase 6 Nested-Freeform Grouping Evidence

## Result and scope

Grouping and ungrouping now preserve the exact schema-v2 position-map invariant when their shared
parent uses freeform positioning. The existing controller and selection-action surfaces continue to
publish one structural command, while the framework-neutral planner supplies every spatial value
the command needs without guessing from optional document fields.

This completes the grouping and ungrouping slice of the remaining Phase 6 nested-freeform batch.
Paste and external-drop placement into freeform parents, the named positioning control, the final
performance/browser matrix, and the Phase 6 audit remain downstream.

## Local placement and command ownership

For grouping in a nested freeform parent, canonical child positions define the selected block's
local start edge and measured frame sizes define its complete bounds. The new ordered group retains
the selected roots in canonical order, occupies the first selected stacking index, and replaces all
selected parent position keys with exactly one copied group position. Root grouping retains its
workbench-coordinate placement, and grouping in an ordered parent still replaces the selected
siblings without carrying spatial data.

For ungrouping into a freeform parent, the planner combines the group's canonical local position
with the currently measured group and direct-child workbench rectangles. This converts every child
to the destination parent's local coordinates through the current outer viewport and native scroll
state without introducing a second geometry owner. If a displayed child crosses either nested
start edge, the complete promoted block translates together so every coordinate remains
non-negative and all offsets remain intact.

The immutable command replaces the group ID and position key with the promoted child IDs and their
exact planned positions in one validated document. Unaffected siblings retain their canonical
positions, no group or child key remains stale, undo/redo keeps one structural history boundary,
and malformed, incomplete, extra, negative, or inaccessible placement data fails before a partial
document. The internal ungroup command now calls its spatial input `positions`; the root-only name
was removed without a compatibility alias.

## Interaction and visual proof

The backend-free nested-freeform fixture groups two freeform siblings through the keyboard
selection-action menu, verifies the exact local group position and parent position-map replacement,
then ungroups through the same keyboard path and checks measured child-local positions. Both actions
publish one controlled change, announce completion through the pre-mounted polite region, preserve
native menu semantics, and restore focus to the accepted resulting selection. Axe reports no
violations in the grouped state.

The new nested-freeform grouped baseline was inspected at its original 1,152 by 701 resolution. It
shows the focused selected group, both recursively retained children, visible non-color selection
and focus cues, and the containing freeform canvas without clipping its controls. The older
top-level grouping baseline was narrowed from the entire playground page to the directly affected
1,152 by 631 workspace region after its reviewed diff proved confined to subpixel icon rendering;
the regenerated scoped image was also inspected at original resolution.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; focused
Playwright Chromium baselines were inspected at original resolution).

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 were used.
- Focused Vitest coverage passes 13 grouping tests for local bounds, exact parent-map replacement,
  measured ungroup conversion, start-edge block translation, prototype-mutator IDs, strict
  coordinates, existing root placement, and ordered nesting.
- The exact nested-freeform Chromium selector passes keyboard grouping and ungrouping, controlled
  change counts, canonical serialization, focus restoration, polite announcements, Axe, and the
  inspected grouped baseline. The directly affected ordered-history and top-level grouping
  selectors pass; the top-level baseline now scopes its assertion to the workspace.
- Changed-file quality passes repository/import boundaries, deterministic dependency policy,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, unit and boundary
  tests, plan-loop automation, package/playground builds, exact tarball contents, documentation
  links, and the declaration report.
- The unrelated tarball-installed consumer passes lockfile policy, strict build, and Chromium
  runtime verification through declared exports. No public export or declaration changed.
- No manifest, lockfile, dependency, lifecycle-script allowlist, trust policy, or exception changed,
  so the network-backed supply-chain gate was not duplicated. The recorded unavailable in-app
  browser release gate was not retried.

## Remaining repository-actionable work

Paste and external-drop planning are next: both must derive exact destination-local positions for
freeform parents and preserve the strict position map through validation and one accepted command.
The named ordered/freeform positioning control, complete performance/browser evidence, and final
Phase 6 audit follow.
