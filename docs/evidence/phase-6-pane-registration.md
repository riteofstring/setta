# Phase 6 Pane-Registration Evidence

## Result and scope

The tenth repository-actionable Phase 6 batch is implemented. `@setta/workspace` now accepts strict
host pane registrations and presents one active controller-only surface beside or above/below the
measured canvas. The batch adds no pane field to `WorkspaceDocument`, persistence owner, domain
panel, internal-store access, second controller, or compatibility path.

This record covers the tightly coupled registration, state ownership, toolbar disclosure,
responsive layout, focus, playground, packed-consumer, documentation, and verification work.
Viewport culling is the next independently actionable Phase 6 item.

## Public and ownership boundary

| Boundary             | Implemented contract                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registration         | `WorkspacePaneRegistration` supplies one unpadded unique ID, non-empty visible label, decorative icon, logical `start` or `end` placement, and renderer. Dense-array, plain-data, known-field, accessor-safe runtime validation fails specifically before invoking a renderer.       |
| Controller isolation | Only the active renderer mounts, and it receives the existing public `WorkspaceController`. Pane content receives no document setter, internal store, geometry service, XYFlow type, dnd-kit owner, persistence primitive, or Setta application contract.                            |
| State ownership      | `activePaneId` plus `onActivePaneChange` is controlled; `defaultActivePaneId` is uncontrolled. Controlled proposals remain host-authoritative, removed uncontrolled registrations reconcile closed, and at most one pane is active. Visibility and placement remain host UI state.   |
| Toolbar linkage      | Every registration contributes one utility-toolbar disclosure with a package-reserved control ID, visible-label accessible name, `aria-expanded`, and `aria-controls`. Pane controls share the existing roving toolbar owner without entering the ordinary host-control namespace.   |
| Layout               | Wide workbenches reserve a bounded logical start/end grid track and resize the existing measured canvas. Below the content-derived container breakpoint, pane and canvas stack in reading order without covering focusable canvas content or producing page-level horizontal scroll. |
| Playground           | The backend-free host controls one active pane and registers the existing outline and saved-view surfaces. The former saved-view overlay toggle and every tied browser assumption were replaced before the focused rerun.                                                            |
| Packed consumer      | The unrelated tarball consumer imports the declared pane type, opens an outline by default, switches to saved views through the generated toolbar disclosure, and verifies the active end pane at runtime without internal imports.                                                  |

## Interaction, accessibility, layout, and visual evidence

Pane activation is a native toolbar-button disclosure. Focus remains on its trigger while
`aria-expanded` changes and the linked named complementary landmark mounts. The native close
button restores focus to the surviving trigger. Switching registrations atomically unmounts the
previous renderer and mounts the next, so hidden pane controls cannot remain in the keyboard or
screen-reader order. Icons are decorative; the visible label is the accessible name.

Logical start/end grid placement mirrors with `dir="rtl"`. Wide layout keeps the pane and canvas
in one explicit grid row, while the narrow container layout stacks both as non-overlapping rows.
Pane content has bounded scrolling and overscroll containment; native pointer and wheel input does
not reach the viewport. Desktop controls retain 40-pixel targets and coarse-pointer close controls
reach 44 pixels. The shell adds no required motion and remains stable under reduced motion, 200%
page scale, dark appearance, and 320-CSS-pixel reflow.

The three affected original-resolution baselines were inspected directly. The wide light baseline
shows a clear start-pane/canvas boundary, readable hierarchy, retained canvas toolbar and minimap,
and no content collision. The narrow dark RTL baseline shows correct mirrored heading/action order,
full-width stacked pane content, and no horizontal clipping. The saved-view baseline retains
legible form, restore, rename, and delete controls inside the registered end pane. Pane activation
dismisses its transient tooltip without moving trigger focus.

The plan's recorded in-app-browser release gate remains unavailable and was not retried. No GUI,
extension, background service, credential, or remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; focused
Playwright Chromium pane and saved-view baselines were inspected at original resolution).

## Verification boundary

- Focused static React coverage passes four tests for active-only rendering, public-controller
  isolation, toolbar/panel linkage, controlled and uncontrolled state, strict malformed input,
  accessor rejection, and reserved control namespaces.
- The final exact Chromium selector passes four pane and directly affected saved-view workflows.
  They cover controlled switching, measured wide layout, close-focus restoration, Axe, 200% page
  scale, coarse pointers, reduced motion, RTL, 320-CSS-pixel reflow, persistence, read-only usage,
  and the three inspected visual baselines.
- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passes
  for 25 project files with repository/import boundaries across 324 files, all four dependency
  manifests, formatting, lint and complexity, file lengths, strict package/playground/root types,
  dead-code analysis, 460 unit tests across 44 files, six boundary tests, plan-loop automation,
  package/playground builds, exact tarball contents, and the declaration report.
- The unrelated tarball-installed consumer passes frozen lockfile policy, strict TypeScript,
  production build, and headless runtime verification while importing the declared pane type,
  rendering an initial outline pane, and switching to the registered saved-view pane.
- No manifest, lockfile, external dependency, lifecycle allowlist, trust policy, or exception
  changed, so the current network-backed supply-chain gate is not duplicated. Deterministic
  dependency policy remains part of changed-file quality and the packed-consumer check.
