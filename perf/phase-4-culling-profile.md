# Phase 4 — large-document culling profile

Phase 4 of the Setta-styled workspace UI plan requires profiling large documents and all-depth
viewport culling with the final package CSS, including pinning. This report records the harness,
the pinning semantics it verified, and the findings from the declared reference run. The
append-only numbers live in [culling-profile.md](./culling-profile.md) (`phase-4-culling`,
21:42 run) with full traces in `perf/interaction-traces/phase-4-culling-{development,production}.json`.

## Harness

`corepack pnpm perf:culling` drives the new public-API-only `/?culling-profile` playground route:
a deterministic 305-section document (130 grid roots; every fifth cell a vertical group holding
two leaves plus a nested horizontal group, every fifth-offset-three cell a freeform container
with two children — three nesting depths) spread over roughly 5,040 × 5,600 canvas units, with
viewport culling enabled at the default 160 px overscan, the built-in toolbar and minimap
mounted, and host-rendered note content. One grid column stays vacant so pan gestures can press
an empty canvas point at any row, and two named cells next to that alley are the focus-pinning
and drag targets. The runner fails loud on fixture drift: it asserts the 305-section document
count, that mounted frames stay far below the document size (a culled container drops its whole
subtree behind one placeholder), that most mounted frames are culled placeholders, that the pan
start point hits the empty pane, that the drag publishes its `root-layout` owner, and that the
page never scrolls mid-gesture. `tests/e2e/workspace-culling-profile.spec.ts` guards the route's
contract (document size, subtree dropping, focus pinning across a far displacement, no upstream
attribution badge, axe scan) in the deterministic browser matrix.

## Pinning semantics verified

- **Focus pinning.** Clicking the "Pinned target" leaf focuses it; after an unmeasured 1,800 px
  wheel-pan displacement the focused section stays rendered (`data-workspace-culled="false"`)
  with live host content while its unfocused neighbor culls. The pin held through every measured
  wheel-pan pass and released only when focus moved — which is the package's documented
  focus-scoped contract, not a defect.
- **A pointer pan releases the pin by design.** Pressing the canvas pane moves focus, so the
  measured pinned-pan workload uses wheel pan (which preserves focus). The first harness draft
  measured a pointer pan and failed loud on exactly this: selected/focused pinning does not
  survive interacting with the pane, and the profiler now encodes that semantic instead of
  papering over it.
- **Active-gesture pinning.** The drag workload exercises the `moving` pin on the dragged
  section over the large culled document and asserts the section stays mounted through the
  gesture.

## Findings — declared reference run (3 passes per cell)

Production is clean everywhere:

- Pan (0.5× with 62 rendered frames, 1× with 14), pinned wheel pan, and top-level drag: worst
  gap 17.5 ms across all 15 cells, zero gaps above 32 ms, zero long tasks. Drag activation over
  the 305-section culled document matches the small-fixture Phase 1/2 profile (activation max
  17.2 ms), so the bounded geometry index and culling keep activation independent of document
  size.
- Zoom-out mass mount (14 → 209 rendered frames across an 8-step Alt+wheel sweep): exactly one
  33.3–33.4 ms doubled frame per pass and no long task; ~120 ms total script across the whole
  sweep. Zooming back in is clean (max 16.7 ms).

Development matches production on pan, pinned wheel pan, and drag (worst repeatable gap
25.4 ms; one isolated non-repeating 41.6 ms pan cell at 0.5×). The zoom-out mass mount is the
one repeatable development-only cost: 91.5–91.7 ms max gap with 52–76 ms long tasks in every
pass, ~375 ms sweep script versus ~120 ms in production (~3× — StrictMode double rendering and
unminified React work while ~195 section subtrees mount in bursts). Layout and style-recalc
counts are identical between builds (24 layouts, ~500 recalcs per sweep), so the delta is
development JavaScript, not a style or layout defect in the final CSS.

## Conclusion

With the final Setta chrome, all-depth culling keeps sustained pan, pinned-offscreen pan, and
drag activation at display cadence in both builds on a document more than 15× the rendered set,
and the worst production behavior is a single skipped frame while re-mounting two-thirds of a
305-section document during a deliberate full-range zoom-out. No repository-actionable defect
falls out of the profile: the development-only zoom-out long tasks are dev-build React overhead
on a mass mount whose production counterpart is clean, and the plan's frame-pacing gates target
gesture activation, which stays green here. Regression claims against this profile need a
repeatable production miss on the declared `phase-4-culling` configuration.
