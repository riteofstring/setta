# Phase 6 Mixed-Parent Batch Movement Evidence

## Result and scope

The seventh repository-actionable Phase 6 batch is implemented. In free-move mode,
`@setta/workspace` now moves normalized section selection roots from multiple source parents as one
atomic block. The generic sortable-item surfaces likewise move normalized roots from multiple
parents, including multiple named lists inside one mounted interaction surface. This batch
supersedes the initial-milestone mixed-parent section rejection and item active-row fallback; it
does not add a compatibility path for either removed behavior.

Mixed-parent section sorting remains unavailable because sorting is defined within one ordered
parent. Grouping still requires one shared parent, item movement remains scoped to one mounted
tree/list surface, and cross-section item dragging remains deferred. The next independently
repository-actionable Phase 6 item is saved viewport presets.

## Public and ownership boundary

| Boundary                         | Implemented contract                                                                                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section selection                | Ancestor-selected descendants are removed once. Remaining roots use deterministic visual-root and hierarchy-preorder ordering, with one aligned `sourceParentIds` entry per root.                                                                                                            |
| Section planning and application | `SectionMovePlan` carries aligned source parents. Free moves remove every root from its exact source, insert the complete canonical block at one destination, preserve descendant subtrees, and publish one controlled document change. Same-parent sorting retains its existing constraint. |
| Section interaction              | Pointer, touch, and keyboard sessions use the active normalized root as their anchor while previewing and committing the complete block. Layout preview closes every affected source region and opens the destination without changing canonical DOM order before commit.                    |
| Item planning and application    | `ItemMovePlan` and drag blocks carry aligned `sourceParentIds`. Named-list plans additionally carry aligned `sourceListIds`. Strict application revalidates canonical placement, removes every root from its exact source, and inserts all complete subtrees atomically.                     |
| Item interaction                 | A selected active item moves the complete normalized selection instead of falling back to itself. The active normalized root anchors the first keyboard direction; named-list Page Up and Page Down movement can converge roots from multiple parents or lists into one destination.         |
| Host policy and data             | Hosts still own controlled acceptance, item values, persistence, history, and domain containment rules. The package exposes one immutable proposal and never serializes transient selection or gesture state into `WorkspaceDocument`.                                                       |

## Interaction, accessibility, and visual evidence

The existing native section and item movement buttons remain the only activation surface. Free
section movement no longer disables a handle merely because selected roots have different
parents; sorting still provides a specific shared-parent explanation. Pointer, touch, and keyboard
paths use the same normalized roots and one live-feedback owner. Preview and completion
announcements name the active root, count the remaining roots once, name the destination, and
restore focus to the active handle after controlled acceptance. Locked moving roots and host
rejections remain preflighted without partial application.

The original-resolution Chromium mixed-section baseline was inspected directly. It shows Nested
Alpha and Nested Beta selected at different depths, both affected source layouts closing, and one
full insertion placeholder in Empty container. The mixed-item baseline shows Theme and Notes
moving as “Theme and 1 more” from different parents/lists into Optional fields, with visible focus,
selection, destination framing, and no clipped controls or overlapping feedback. The directly
affected host-rejection baseline was regenerated and inspected; its non-color-only invalid banner
and destination indicator remain visible.

The plan's recorded in-app-browser release gate remains unavailable and explicitly says not to
retry it during routine implementation. No GUI, extension, background service, credential, or
remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; focused
original-resolution Playwright Chromium mixed-parent and host-rejection baselines were inspected).

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 were used. Focused
  framework-neutral coverage passed 115 tests across nine files for canonical section/item
  ordering, ancestor normalization, aligned ownership fields, strict stale-plan rejection, atomic
  multi-source removal/insertion, layout preview, filtering reconciliation, named-list movement,
  and active-root keyboard anchoring.
- Exact Chromium selectors cover mixed-parent section pointer preview and controlled commit,
  mixed-parent item keyboard transfer across named lists, the retained host-policy rejection,
  focus restoration, live announcements, and scoped Axe scans. Both new baselines and the directly
  affected rejection baseline were inspected at original resolution.
- Changed-file quality passed for 41 project files with repository/import boundaries across 305
  files, all four dependency manifests, formatting, lint and complexity, file lengths, strict
  types, dead-code analysis, 444 unit tests across 41 files, six boundary tests, plan-loop
  automation, package/playground builds, exact tarball contents, and the declaration report. The
  unrelated tarball-installed consumer imported the changed public movement shapes through
  declared exports only and passed lockfile-policy verification, strict TypeScript, production
  build, and runtime smoke.
- No dependency input changed, so the network-backed supply-chain gate is not duplicated. The
  recorded unavailable in-app-browser release gate is not retried.
