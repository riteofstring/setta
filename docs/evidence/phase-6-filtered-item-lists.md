# Phase 6 Filtered Item-List Evidence

## Result and scope

The sixth repository-actionable Phase 6 batch is implemented. `@setta/workspace` can now render an
ancestry-closed filtered projection of one sortable tree or one shared named-list surface while
reconciling every accepted visible move to the larger canonical tree. The batch does not serialize
query state, infer domain matching, mount hidden renderers, create a second interaction owner, or
change the existing canonical move-plan shapes.

The next ordered Phase 6 work is to evaluate mixed-parent batch section and item dragging and
implement it only if one deterministic interaction proves understandable.

## Public and ownership boundary

| Boundary                     | Implemented contract                                                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework-neutral projection | `createFilteredSortableItemTree` validates a dense, unique, known, ancestry-closed ID set and returns the canonical tree by identity when every item remains visible. Empty projections and parents with only hidden children remain valid.               |
| Canonical reconciliation     | `reconcileFilteredSortableItemMove` validates a plan against the filtered projection and the canonical tree. It anchors before the next visible sibling, otherwise after the previous visible sibling, and appends when no visible anchor exists.         |
| React surface                | Optional `visibleItemIds` on `SortableItemTree` and `SortableItemLists` removes hidden rows and targets under the existing pointer, touch, keyboard, focus, and announcement owner. `canMove` and `onMove` receive canonical plans, not filtered indexes. |
| Structural integrity         | Hidden items retain relative order. Hidden descendants travel with a moved visible subtree root. Selected IDs must remain visible, and missing visible ancestors fail specifically instead of flattening or guessing.                                     |
| Host policy                  | The host owns query controls, matching, ancestor inclusion, result-count announcements, hidden-selection clearing, values, persistence, history, and authorization. Filter state never enters `WorkspaceDocument`.                                        |
| Consumer boundary            | The playground filters its payload-owned named lists by label and persists the reconciled canonical move. The unrelated packed fixture derives and renders a projection through declared package exports only.                                            |

## Interaction, accessibility, and visual evidence

Filtered surfaces expose visible and canonical item counts in a screen-reader description and mark
movement feedback as a “visible position.” Named-list labels remain native regions, every movement
starts from the same native handle, and the pre-mounted polite live region announces preview,
completion, cancellation, and rejection. A filtered empty branch distinguishes “no matching items”
from a truly empty canonical branch.

The playground supplies a visible native search label, a 44-pixel search/control row, a specific
“Clear filter” action, and a polite result count. Its filter adds every matching item's ancestors,
clears selection that becomes hidden, and leaves query state transient. The filtered surface
reserves one stable inline feedback slot, so starting movement does not cover the result count or
shift drag-start geometry.

The original-resolution Chromium filtered baseline was inspected directly. It shows the active
query and result count, the required-list grouping, both filtered rows, focus on the Name movement
handle, the atomic Name overlay, the full insertion placeholder, and the visible-position preview
without clipped filter controls or overlapping status text. The two retained item previews plus
the only auto-layout and clipboard baselines containing the field-list renderer were also updated
and inspected; source inspection confirmed no other retained baseline contains that renderer.

The plan's recorded in-app-browser release gate remains unavailable and explicitly says not to
retry it during routine implementation. No GUI, extension, background service, credential, or
remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; focused
original-resolution Playwright Chromium filtered and affected workflow baselines were inspected).

## Verification boundary

Verification used exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0.

- Focused framework-neutral and static React coverage passed 43 tests. The final exact Chromium
  selector passed the filtered empty-result, recovery, keyboard-reorder, focus, persistence, and
  scoped-accessibility workflow. The exact 320 CSS-pixel reduced-motion workflow also passed.
- Four directly affected existing Chromium selectors remained green: keyboard item movement,
  accepted cross-list movement, top-level auto-layout, and clipboard cloning. The new filtered
  baseline and the four affected original-resolution baselines were inspected directly.
- Changed-file quality passed for 27 project files with repository/import boundaries across 301
  files, all four manifests, formatting, lint and complexity, file lengths, strict types,
  dead-code analysis, 436 unit tests across 41 files, six boundary tests, plan-loop automation,
  package/playground builds, exact tarball contents, and the declaration report.
- The unrelated tarball-installed consumer passed strict build and runtime smoke while importing
  the public projection helper and rendering the public filtered named-list surface. Its install
  retained loaded-lockfile and supply-chain-policy verification.
- No dependency input changed, so the network-backed supply-chain gate was not duplicated. The
  recorded unavailable in-app-browser release gate was not retried.
