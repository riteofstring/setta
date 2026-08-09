# Phase 6 Named Item-List Evidence

## Result and scope

The fifth repository-actionable Phase 6 batch is implemented. `@setta/workspace` now supports
multiple visible named item lists within one section and atomic movement between those lists. The
batch extends the existing generic sortable-item boundary; it does not add item data to
`WorkspaceDocument`, infer list meaning from host payloads, enable cross-section dragging, or add a
second drag-and-drop owner.

This record covers the tightly coupled multiple-named-list and same-section cross-list movement
items. The next independently actionable Phase 6 item is filtered-list reordering against a larger
canonical tree.

## Public and ownership boundary

| Boundary              | Implemented contract                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serializable core     | `SortableItemList` pairs one stable `listId` and visible `label` with one existing `SortableItemTree`. `validateSortableItemLists` requires a non-empty dense list set, unique list IDs, globally unique item IDs, and a valid tree per list. Root IDs remain list-scoped.                                        |
| Planning              | `planSortableItemListMove` returns planned, unchanged, or specifically rejected decisions. Public drag blocks and move plans identify both source and destination list IDs and public parent IDs; collision-checked aggregate roots stay internal.                                                                |
| Immutable application | `applySortableItemListMove` strictly revalidates an accepted public plan, moves complete descendant subtrees, returns the original array for a no-op, and preserves unaffected list, tree, and child-array identities.                                                                                            |
| React surface         | One controlled `SortableItemLists` instance renders all named lists and owns their shared selection, pointer, long-press touch, keyboard, preview, focus-recovery, and live-announcement session. Existing `SortableItemTree` behavior and exports remain direct rather than routed through a compatibility path. |
| Host policy           | Item renderers, labels, and containment callbacks receive the current `listId`. `canMove` and `onMove` receive only the list-aware public plan. The host still owns item values, persistence, history, and policy acceptance.                                                                                     |
| Consumer boundary     | The backend-free playground stores the list array directly in its field-list payload, and the unrelated fixture imports only declared core and React exports. No application source alias, runtime service, or upstream drag type enters the package API.                                                         |

## Interaction, accessibility, and visual evidence

Each list is a native `section` named by a visible label, with at least twice the ordinary row gap
between adjacent list groups. Existing native selection and movement buttons retain their visible
focus treatment and coarse-pointer target sizes. Item IDs are globally ordered by list order and
tree preorder for deterministic selection and focus.

Pointer and touch collision can target any named root under the one upstream interaction boundary.
Keyboard users start movement with Enter or Space, use the existing arrows within a list, and use
Page Up or Page Down to move the active sibling block to the corresponding position in the previous
or next list. Logical outdent stops at the current named root and announces that alternative.
Preview and completion announcements include the destination list, position, and host rejection;
completion restores focus to the active handle after the controlled host accepts the new list
array.

The original-resolution Chromium baselines were inspected directly. The retained keyboard
baseline shows the visible required-list grouping and nested placeholder, while the new cross-list
baseline shows the active Email overlay, Optional fields destination label, Notes row, insertion
placeholder, focus outline, and the larger inter-list separation without clipped controls or
overlapping text.

The plan's recorded in-app-browser release gate remains unavailable and explicitly says not to
retry it during routine implementation. No GUI, extension, background service, credential, or
remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; focused
original-resolution Playwright Chromium named-list baselines were inspected).

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 were used. The focused
  named-list/core and React static selectors pass 41 tests across two files, including strict list
  validation, repeated and collision-like roots, plan projection, subtree application, preserved
  identities, native region semantics, keyboard instructions, and the retained single-tree empty
  state.
- The final exact Chromium selector passes both the keyboard item workflow and accepted cross-list
  persistence workflow against the reviewed baselines. It covers named regions, list-root outdent
  guidance, Page Down preview/commit parity, focus restoration, editable host inputs, interaction
  exclusion, JSON reset/import, local reload, reduced motion, and Axe. The directly affected
  playground persistence selector also passes; focused pointer/zoom and touch/host-rejection
  selectors passed while the batch was developed.
- Changed-file quality passes for 26 project files with repository/import boundaries across 296
  files, all four dependency manifests, formatting, lint and complexity, file lengths, strict
  package/playground/root types, dead-code analysis, 426 unit tests across 40 files, six boundary
  tests, plan-loop automation, package/playground builds, exact tarball contents including the new
  list module, and the declaration report.
- The unrelated consumer installs the local tarball into a temporary directory, imports
  `SortableItemLists` plus the public validation and immutable-application helpers, passes strict
  TypeScript, builds, and completes its runtime smoke with an accepted cross-list move.
- No manifest, lockfile, dependency, lifecycle allowlist, trust policy, or exception changed, so
  the current network-backed Phase 5 supply-chain gate is not duplicated for this routine source
  batch; deterministic dependency policy remains part of changed-file quality.
