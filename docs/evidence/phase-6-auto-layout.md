# Phase 6 Top-Level Auto-Layout Evidence

## Result and scope

The fourth repository-actionable Phase 6 batch is implemented. `@setta/workspace` now exposes one
framework-neutral rectangle-packing kernel, one root auto-layout planner, and one measured public
controller command. The batch changes only top-level positions; it does not add a layout engine
dependency, infer relationships from host payloads, resize sections, reorder persistent stacking,
or serialize layout preferences.

This record covers the tightly coupled top-level auto-layout and packing item. The independently
evaluated Phase 6 follow-ons remain incomplete and repository-actionable, beginning with multiple
named item lists within one section.

## Public and ownership boundary

| Boundary               | Implemented contract                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure core              | `packWorkspaceRectangles` validates and shelf-packs positive finite rectangles from an explicit origin. `planWorkspaceRootAutoLayout` derives the current minimum x/y anchor and returns a prototype-safe root-position record without mutating its input. |
| Deterministic ordering | Packing sorts by padded height, padded width, and canonical input order, targets the square root of total padded area, and uses one configurable finite non-negative gap. The default gap is 48 workbench units.                                           |
| React controller       | `autoLayoutRootSections` reads every root frame from the existing geometry-backed canvas controller and submits all planned positions through the existing atomic root-movement command. No upstream XYFlow or DOM type enters the public contract.        |
| Canonical state        | One accepted invocation emits one `section-move` change and history entry while preserving root stacking, section and payload identities, hierarchy, sizes, viewport, and transient selection. Repeating the accepted plan is a no-op.                     |
| Policy and readiness   | Live `editLayout` policy is checked before measurement. Two-or-more-root layouts reject atomically when any root is locked, the canvas is unavailable, or any measured frame lacks positive finite geometry.                                               |
| Host extension         | The backend-free playground and unrelated packed consumer expose the command through the declared toolbar-control contract. The package adds no new mandatory control, pane, preference, document field, or styling contract.                              |

## Validation, interaction, and accessibility evidence

The pure contracts reject sparse or accessor-backed arrays, extra fields, duplicate or empty IDs,
non-finite coordinates, non-positive dimensions, negative gaps, and arithmetic overflow. Tests
retain prototype-like IDs, input immutability, stable equal-size ordering, non-overlap, exact anchor
preservation, and idempotence.

The playground uses the existing native toolbar button, its existing roving focus and 40/44-pixel
hit-area behavior, an outline `currentColor` icon at the established 1.5-pixel stroke weight, and
the pre-mounted polite page status. The focused Chromium workflow proves the command at 200% page
scale, selected-section retention, non-overlapping rendered roots, one-step undo/redo, locked-root
rejection, read-only disabled state, 320-CSS-pixel reflow, reduced motion, and Axe. The reviewed
original-resolution baseline shows a clear 48-unit visual gap without overlapping selected-frame
controls or a stale tooltip.

The plan's previously recorded in-app-browser release gate remains unavailable and explicitly says
not to retry it during routine implementation. No GUI, extension, background service, credential,
or remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; the focused
original-resolution Playwright Chromium auto-layout baseline was inspected).

## Verification boundary

- The focused auto-layout unit selector passes seven tests covering packing, planning, controller
  dispatch, one canonical change, no-op behavior, policy, locks, geometry readiness, runtime input
  validation, and prototype-safe IDs.
- The two-workflow `workspace-auto-layout.spec.ts` Chromium selector passes with its reviewed visual
  baseline, atomic root movement, anchor/order/state preservation, rendered non-overlap, undo/redo,
  lock rejection, native control semantics, 200% page scale, 320-pixel reflow, reduced motion, and
  Axe assertions.
- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 changed-file quality
  passes for 17 project files with repository and import boundaries across 292 files, all four
  dependency manifests, formatting, lint, file length, strict package/playground/root types,
  dead-code analysis, 415 unit tests across 39 files, six boundary tests, plan-loop automation,
  package/playground builds, exact packed contents including the new auto-layout module, and the
  regenerated declaration report.
- The unrelated consumer installs the local tarball into a temporary directory, imports both pure
  layout helpers, supplies a typed host toolbar control for the controller command, passes strict
  TypeScript, builds, and completes its headless runtime smoke after arranging three roots.
- No manifest, lockfile, dependency, lifecycle allowlist, trust policy, or exception changed, so
  the current network-backed Phase 5 supply-chain gate is not duplicated for this routine source
  batch; deterministic dependency policy remains part of changed-file quality.
