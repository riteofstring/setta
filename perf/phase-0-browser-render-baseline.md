# Phase 0 Browser Render Baseline

## Scope

This non-timing baseline covers the Phase 0 root-node/recursive-DOM adapter proof in Chromium. It
guards the number of package recursive-root renders while high-frequency work remains transient;
it does not establish a cross-machine frame-time budget.

The proof previously subscribed every measured root and descendant to XYFlow viewport state. The
baseline audit identified that subscription shape as whole-tree work during viewport movement. The
adapter now has one viewport subscription feeding one adapter-local DOM measurement registry.
The registry observes all visible frames, coalesces root-position, nested-scroll, viewport, resize,
and window-resize measurement requests on animation frames, and does not publish geometry changes
when a remeasurement differs by no more than 0.01 workbench units.

## Repeatable browser workload

Run the focused scenario with the repository's exact Node and pnpm versions:

```text
corepack pnpm test:e2e --project=chromium tests/e2e/adapter-proof.spec.ts --grep "bounds recursive renders"
```

The scenario records its measurements as a `phase-0-browser-baseline` Playwright annotation and
enforces these budgets:

| Stream                     |                    Input workload | Required transient result                                                                                                   | Completion or geometry budget                                                                                                                         |
| -------------------------- | --------------------------------: | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| dnd-kit structural preview | 96 pointer steps after activation | Both recursive XYFlow root render counters remain unchanged; the external drag store publishes between 48 and 240 snapshots | One accepted package command; each root renders no more than twice under React Strict Mode for the canonical commit                                   |
| XYFlow root movement       |                  96 pointer steps | Both recursive-root render counters remain unchanged and the selected descendant overlay stays aligned                      | Shared geometry revision advances while the root is live; one accepted package command; each root renders no more than twice for the canonical commit |
| XYFlow viewport pan        |           96 trusted wheel events | Both recursive-root render counters remain unchanged                                                                        | Unchanged workbench frames produce no more than 16 shared-geometry revisions                                                                          |

The wide publication ranges deliberately bound architecture rather than host speed. They catch a
return to per-event whole-tree state while allowing Chromium to coalesce trusted input differently
across machines.

## Result recorded on 2026-08-08

The focused Chromium scenario passed all budgets with the exact-pinned toolchain. The existing
geometry workflows remain responsible for selection-overlay alignment, recursive resize,
measurement-gated fit, nested scroll isolation, and 0.5x/1x/2x coordinate correctness.

This baseline is representative Phase 0 evidence. Later performance work still needs milestone
budgets for production workbench documents, virtualization decisions, and sustained drag-frame
timing.
