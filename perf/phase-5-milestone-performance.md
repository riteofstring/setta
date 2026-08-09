# Phase 5 Milestone Performance Report

## Scope

This append-only report records the initial package milestone's repeatable performance evidence on
2026-08-09. It combines a new framework-neutral benchmark of the built package with the existing
geometry-index and trusted-Chromium structural baselines. The measurements expose fixture drift and
architecture regressions; they do not turn one machine's elapsed time into a support promise.

The milestone benchmark imports only the declared `@setta/workspace/core` and
`@setta/workspace/testing` build outputs. It does not reach into source files, use a Setta runtime,
or substitute a source alias for the locally installable artifact.

## Repeatable commands

Use the exact repository toolchain:

```text
corepack pnpm perf:milestone
corepack pnpm perf:geometry
corepack pnpm test:e2e --project=chromium tests/e2e/adapter-proof.spec.ts --grep "bounds recursive renders"
```

`perf:milestone` builds the package, performs bounded warmup outside each observation, validates
every result, and prints JSON with fixture sizes, elapsed totals, and deterministic checksums. The
other two commands retain the Phase 0 all-depth geometry and browser render baselines instead of
duplicating those workloads inside a second harness.

## Framework-neutral observations

Environment: Node 24.18.1, Darwin arm64. Timings are total elapsed milliseconds after warmup.

| Workload                                      | Fixture and iterations                                                                     | Observed total |   Checksum |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------: | ---------: |
| Validate and navigate a recursive document    | 1,024 sections: 128 roots with seven direct children, 40 iterations                        |     235.362 ms |    860,180 |
| Parse and validate a serialized document      | The same 1,024-section document, 20 iterations                                             |      91.904 ms | 87,477,180 |
| Plan and immutably apply a section-block move | 64 selected siblings between parents containing 512 children each, 200 iterations          |      84.363 ms | 12,864,000 |
| Build layout-stable section previews          | 512 sibling rectangles with alternating horizontal and vertical runs, 120 iterations       |      17.805 ms |  6,967,220 |
| Resolve retained collision targets            | 256 sortable candidates with pointer and previous-target state, 1,000 frames               |      10.789 ms | 24,024,000 |
| Plan visible or adjacent smart placement      | 80 occupied root rectangles with grid alignment and moving viewport origins, 60 iterations |       7.716 ms |  2,957,280 |
| Plan and immutably apply an item-block move   | 64 selected siblings in a 2,000-item flat tree, 100 iterations                             |     293.752 ms | 10,423,200 |
| Validate and traverse a deeply nested tree    | One 2,048-level sortable item chain, 30 iterations                                         |     111.393 ms |    958,830 |

The complete suite checksum was `146,531,890`. Each workload asserts its result shape and count, so
dead-code elimination, an empty fixture, a rejected plan, or an incomplete traversal cannot appear
as an artificially fast successful run.

The document workload deliberately mixes vertical and horizontal child-layout metadata and grow
and scroll container metadata. The item fixtures cover both a large sibling list and depth without
recursive traversal. The section workload covers canonical selected-block ordering, cross-parent
application, collision state, and transform generation rather than timing a no-op helper.

## Browser and React structural evidence

Elapsed Node totals do not measure browser layout or host-renderer cost. The milestone therefore
retains structural browser and React budgets for the high-frequency paths where architecture is
more portable than frame time.

| Scenario cluster                                        | Repeatable evidence and guarded outcome                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pan, zoom, root drag, and structural preview            | `adapter-proof.spec.ts` drives 96 structural pointer steps, 96 live XYFlow root steps, and 96 trusted wheel events. Recursive roots do not rerender during transient work; each accepted move emits one command; the viewport burst creates no more than 16 geometry revisions. |
| Large root projection, selection, and transient lift    | `workspace-canvas.test.ts` projects 128 roots. Rename, selection, active lift, and resize each replace only the affected projection; a viewport-only update preserves every root identity.                                                                                      |
| Marquee, selection bounds, minimap, and focus/fit       | Shared-geometry tests cover 2,000 measured frames and all-depth queries; browser workflows retain aligned overlays and navigation at 0.5x, 1x, and 2x without a second DOM measurement owner.                                                                                   |
| Mixed-orientation nesting, resize, and container scroll | Recursive and resize Chromium workflows cover deep cross-container movement, transform-only previews, grow/scroll switching, internal wheel ownership, fixed/content transitions, snapping, minimization, and one-command completion.                                           |
| Large and deep item-tree kernels                        | The milestone benchmark covers 2,000 flat items and 2,048 nested levels. Sortable-item Chromium workflows retain atomic overlays, editable inputs, focus, host rejection, and coordinate correctness at 0.5x and 2x.                                                            |
| Appearance, host inputs, minimize, mount, and unmount   | Focused playground workflows assert that appearance changes retain host input state, minimizing unmounts only the intended body, and canvas teardown returns listeners, observers, geometry targets, and subscriptions to the recorded detached baseline.                       |

These checks address the plan's large-root, large-sibling, deep-tree, zoom, selection, minimap,
resize, scroll, input, appearance, minimize, and cleanup profiles without inventing a browser
millisecond threshold before a stable cross-machine baseline exists.

## Findings and milestone budgets

- The completed core planners and validators finish the recorded large and deep fixtures with the
  expected deterministic output. No framework-neutral workload exposed unbounded traversal or a
  recursive depth failure.
- Collision and preview work remains scoped to supplied candidates and siblings. Production
  interaction owners are still responsible for supplying only viable measured targets rather than
  rescanning the complete document on every pointer event.
- Large item move application intentionally revalidates untrusted public trees and plans. Hosts
  should preserve accepted tree identity outside the changed parents and should not run persistence
  or analytics in preview callbacks.
- Portable gates remain structural: no unrelated root renders during transient movement, one
  canonical document change per accepted gesture, one changed root projection for a targeted
  update, bounded shared-geometry publication, and complete lifecycle cleanup.
- No elapsed-time value in this report is a pass/fail threshold. Future timing budgets require
  repeated measurements on a declared runner and a stable representative host payload.
- Viewport culling remains deferred. A consumer whose mounted DOM materially exceeds these fixtures
  must profile its actual renderer cost and either set a product-specific limit or evaluate the
  Phase 6 culling capability; this milestone does not disguise that limit with a synthetic budget.

This report closes the repository-actionable Phase 5 performance-report item. Final focused
milestone browser/accessibility/performance verification and the complete Phase 5 gate audit remain
separate work.
