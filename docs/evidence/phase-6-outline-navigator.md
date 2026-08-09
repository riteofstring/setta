# Phase 6 Outline-Navigator Evidence

## Result and scope

The third repository-actionable Phase 6 batch is implemented. `@setta/workspace` now exposes an
optional `WorkspaceOutline` React surface that navigates the canonical recursive section hierarchy
through the public controller. The component owns only transient disclosure, roving focus, and its
local live announcement; it does not add pane state to `WorkspaceDocument`, create a second
selection owner, interpret host payloads, or expose an internal store.

This record covers the tightly coupled hierarchical-outline items. The independently evaluated
Phase 6 follow-ons remain incomplete and repository-actionable, beginning with pure top-level
auto-layout and packing commands.

## Public and ownership boundary

| Boundary            | Implemented contract                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package surface     | `WorkspaceOutline` and `WorkspaceOutlineProps` are declared React exports. The root convenience entry point re-exports them, and the unrelated packed consumer renders the navigator through a declared utility overlay without source or internal imports.     |
| Canonical hierarchy | The navigator reads `controller.getDocument()`, validates canonical traversal, and iteratively flattens only visible branches with explicit level, parent, sibling position, and set size. No recursive component walk or serialized outline projection exists. |
| Selection and focus | Ordinary activation calls `focusSection`, preserving the controller as the single selection, geometry, viewport, and DOM-focus boundary. Control, Command, or Shift activation uses `selectSections` to toggle membership in canonical order.                   |
| Transient state     | Top-level containers start expanded by default. A dense, unique list of known IDs may override initial expansion. Later disclosure changes stay local to the mounted navigator and create neither a document change nor a history entry.                        |
| Host meaning        | Rows use stable section IDs and package titles only. Section kind, payload, domain references, persistence, authorization, and any richer outline metadata remain host-owned.                                                                                   |
| Extension placement | The documented path is a fixed `overlaySlots` renderer, which supplies current controller snapshots, package theme tokens, and gesture isolation. A separately placed outline must be rerendered by its controlled host.                                        |

## Interaction, layout, and accessibility evidence

The flat ARIA multiselect tree reports `aria-level`, `aria-posinset`, `aria-setsize`,
`aria-expanded`, and `aria-selected` for every visible row. One roving tab stop serves the tree.
Up/Down and Home/End move through visible rows; logical forward expands or enters a branch and
logical backward collapses or returns to the parent, with left/right mirrored in RTL. Enter and
Space focus the section on the canvas. Modifier activation keeps focus in the tree and updates a
pre-mounted polite live region with the resulting selection count. Pointer disclosure changes only
outline state, and outline clicks stop before the canvas selection owner.

The surface uses logical indentation with a bounded deep-level inset, wrapping titles, a scrollable
tree within stable heading chrome, 40-pixel desktop and 44-pixel coarse-pointer rows, visible
focus, selected checkmarks in addition to color, scoped semantic tokens, and no required motion.
The focused Chromium workflow proves recursive disclosure, all navigation keys, canvas focus,
modifier selection, the local live announcement, Axe, coarse-pointer sizing, 200% page scale,
320-CSS-pixel reflow, reduced motion, and RTL direction. The original-resolution outline baseline
was inspected and retains legible hierarchy, controls, focus, and redundant selection cues.

The in-app browser runtime again reported no available browser surface on 2026-08-09. Repository
and loop policy prohibit seeking a GUI, extension, or background browser service, so the recorded
external-verification release gate remains unavailable and is not an implementation blocker.

CDP visual check: not run (no connected in-app browser surface; the original-resolution Playwright
Chromium outline baseline was inspected).

## Verification boundary

- The focused outline model and server-rendered React contract selector passes four tests.
- The three-workflow `workspace-outline.spec.ts` Chromium selector passes with its reviewed visual
  baseline, recursive keyboard and pointer navigation, modifier selection, live announcement, Axe,
  200% page scale, 320-pixel reflow, coarse-pointer sizing, RTL, and reduced-motion assertions.
- `node_modules/.bin/corepack pnpm quality` passes for 17 changed project files, including
  formatting, repository boundaries, deterministic dependency policy, file limits, TypeScript,
  dead-code analysis, 38 Vitest files with 408 tests, automation tests, package and playground
  builds, packed-artifact verification, and public-API report generation.
- `node_modules/.bin/corepack pnpm consumer:check` passes: the unrelated fixture installs the
  packed tarball from a temporary directory, builds against declared exports, and runs
  successfully with the outline in its utility overlay.
- No manifest, lockfile, external dependency, trust policy, or exception changed. The current
  network-backed Phase 5 supply-chain gate is not duplicated for this routine source batch;
  deterministic dependency policy remains part of changed-file quality.
