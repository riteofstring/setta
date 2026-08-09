# Phase 6 Nested-Freeform Performance Report

## Scope

This append-only report records the final repository-owned nested-freeform performance evidence on
2026-08-09. It extends the existing milestone harness with repeated ordered/freeform conversion of
one 512-child container while retaining the large document, movement, collision, placement, and
item-tree workloads. The measurements guard fixture shape and bounded execution; one machine's
elapsed time is not a support promise.

The harness imports only the built package's declared `@setta/workspace/core` and
`@setta/workspace/testing` entry points. The positioning workload uses the public in-memory host and
controller, so every toggle passes through strict document validation, immutable command
application, history, and the exact position-map contract.

## Repeatable command

Use the exact repository toolchain:

```text
corepack pnpm perf:milestone
```

The command builds the package, runs bounded warmup outside each observation, asserts every result,
and prints fixture sizes, elapsed totals, and deterministic checksums as JSON.

## Observation

Environment: Node 24.18.1, Darwin arm64. Timings are total elapsed milliseconds after warmup.

| Workload                                  | Fixture and iterations                                                          | Observed total |   Checksum |
| ----------------------------------------- | ------------------------------------------------------------------------------- | -------------: | ---------: |
| Switch ordered/freeform child positioning | 512 direct children, 80 alternating conversions through `WorkspaceInMemoryHost` |     867.521 ms |  2,498,560 |
| Validate and navigate a document          | 1,024 sections, 40 iterations                                                   |     242.795 ms |    860,180 |
| Parse and validate a serialized document  | The same 1,024-section document, 20 iterations                                  |      92.159 ms | 88,122,300 |
| Plan and apply a selected section move    | 64 roots between 512-sibling parents, 200 iterations                            |      84.588 ms | 12,864,000 |
| Build layout-stable section previews      | 512 sibling rectangles, 120 alternating orientation iterations                  |      17.141 ms |  6,967,220 |
| Resolve retained collision targets        | 256 candidates, 1,000 pointer frames                                            |       11.34 ms | 24,024,000 |
| Resolve smart placement                   | 80 occupied roots with moving viewport origins, 60 iterations                   |       7.102 ms |  2,957,280 |
| Plan and apply an item-block move         | 64 selected siblings in a 2,000-item tree, 100 iterations                       |     283.119 ms | 10,423,200 |
| Validate a deeply nested item tree        | One 2,048-level chain, 30 iterations                                            |     111.501 ms |    958,830 |

The complete suite checksum was `149,675,570`. The positioning workload alternates between a
complete geometry-derived freeform map and vertical ordered layout. It asserts each accepted
command, the 512-child canonical list, and all 512 freeform keys on every applicable iteration, so
a no-op, rejected conversion, incomplete map, or skipped validator cannot appear as a fast pass.

## Structural browser budgets

The focused Chromium matrix complements the Node observation with architecture-level budgets:

- One accepted positioning action publishes one `section-positioning` change; cancel, unchanged
  conversion, and controlled-host retention publish none.
- Ordered-to-freeform conversion reads each direct child rectangle once and commits a complete
  normalized local map without remounting child surfaces or adding an XYFlow store.
- Freeform-to-ordered materiality comparison is scoped to the direct child list, sizes, and current
  positions. It does not query unrelated sections or the whole geometry index.
- Existing nested movement, reparenting, grouping, clipboard/drop, native scrolling, touch, and
  ownership workflows remain green with one outer viewport and exact local coordinates.
- Positioning chrome is shown only for the directly selected or focused container header, avoiding
  ancestor-control expansion during descendant interactions.

The existing Phase 0 shared-geometry and Phase 5 milestone reports remain the baselines for
all-depth indexing, transient rerender isolation, large roots, and deep item trees; those unchanged
workloads were not duplicated in a second browser harness.

## Finding

The 512-child conversion completes with deterministic accepted results and no extra geometry or
viewport owner. The portable gate remains structural rather than a hard elapsed-time threshold:
conversion work is linear in direct children, transient pointer movement does not invoke it, and
one completed action crosses the controlled document boundary once.
