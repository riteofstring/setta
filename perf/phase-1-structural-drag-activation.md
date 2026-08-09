# Phase 1 — structural-drag activation audit

Working notes for the Setta-styled workspace UI plan, Phase 1. Reference tables live in
[interaction-profile.md](./interaction-profile.md) under the `baseline` (2026-08-10T07:34Z /
07:35Z) and `phase-1` (2026-08-10T08:38Z) labels, with full traces in `interaction-traces/`.
Numbers are machine-local (darwin arm64, 8 cores, Chromium via Playwright 1.62.1, 1440×1000,
CPU throttle 1×).

## Measured cause

CPU sampling (CDP `Profiler`, 100 µs) and `devtools.timeline` traces of the structural-sort
pointer-down at 0.5× zoom attributed the baseline 62–70 ms development / 17–33 ms production
handler span to work that ran synchronously inside the pointer-down dispatch, because dnd-kit
activates mouse drags on the handle with no activation constraint and drains its start microtasks
between the remaining event listeners:

1. **Whole-tree React sync render, ~40 ms development / ~15 ms production.** Starting any gesture
   flipped `activationPolicy` and the active-section fields, which flowed through the section-DnD
   context and the item-interaction context. Every recursive `WorkspaceSectionFrame`, drag handle,
   icon, and item row rerendered inside the dispatch (per-component render totals confirmed the
   cost was spread across all section chrome, ~33 ms in development).
2. **Session construction, 5–11 ms.** `createWorkspaceSectionMoveSession` forced a full
   `flushMeasurement()` (a synchronous re-measure of every registered frame) even when no
   measurement was pending, plus the geometry-index snapshot and drop-region capture.
3. **Start-time feedback mount.** `feedbackStore.start` mounted the source placeholder and live
   announcement synchronously, and the active frame's dnd-kit `isDragSource` signal rerendered the
   whole frame inside dnd-kit's `flushSync`.
4. **Forced style/layout.** Two full style-recalc + layout passes (~8 ms at 0.5× zoom) ran inside
   the dispatch because DOM reads (region capture, dnd-kit's `elementFromPoint` scroller probe)
   interleaved with the React commits above.

## Fixes applied

All gating stays synchronous inside the input dispatch; only presentation moved.

- Added `WorkspaceInteractionActivationStore` (staged/published two-phase external store) mirrored
  synchronously from `useWorkspaceInteractionOwner`. Sensors gate activation through a
  `preventActivation` predicate reading the staged snapshot, and dnd-kit's manager/handle
  `disabled` state already blocks concurrent activation, so gesture exclusivity no longer depends
  on rerendering every handle.
- The section-DnD and item-interaction context values now carry only configuration plus the store;
  gesture-scoped state reaches components through primitive `useSyncExternalStore` selections
  (per-frame `structural`/`active`/`mode`, per-handle disabled, per-tree movement enabled). A drag
  start no longer changes any context identity.
- The interaction owner's React state (canvas data attributes, overlays, announcements) and the
  store publication defer to the next canvas animation frame; finish/mode transitions flush the
  pending broadcast first so the committed state sequence is unchanged.
- `feedbackStore.start`/`rejectStart` and the touch selection request defer to the next frame,
  flushed by the first move or completion event to preserve start → preview → complete order.
- Section frames derive `active` from the store instead of reading dnd-kit's `isDragSource`
  signal (`trackActive: false`), keeping the active frame out of dnd-kit's synchronous start
  flush.
- `createWorkspaceSectionMoveSession` now calls `settleMeasurement()`, which flushes only when a
  measurement pass is actually scheduled.

## Before → after (structural-sort, worst cells)

| Build       | Metric                         | baseline               | phase-1                        |
| ----------- | ------------------------------ | ---------------------- | ------------------------------ |
| development | pointer-down handler (0.5×/1×) | 62–70 ms every pass    | 41–46 ms warm, 60–62 ms cold   |
| development | activation max gap             | 58–67 ms every pass    | 33–42 ms warm, 58 ms cold      |
| development | long tasks ≥50 ms              | every pass (max 71 ms) | cold passes only (max 64 ms)   |
| production  | pointer-down handler (0.5×/1×) | 17–33 ms               | 18–24 ms warm, 33 ms cold      |
| production  | activation max gap             | 16.1–33.3 ms           | 8.6–25.5 ms warm, 33.4 ms cold |

Root drag activation also improved: the development warm-pass 41.6 ms gaps and ≥50 ms long tasks
from the ownership broadcast are gone (now ≤25.4 ms, no long tasks), and sustained movement stays
at display cadence everywhere. All structural gates stayed green (vitest suite, recursive
grouping/keyboard/mixed-parent, root movement, sortable items, nested-freeform contract, section
state, and visual matrix E2E).

## Indexed child-region follow-up

The `phase-1-region-index` traces record the retained follow-up change. Child destination bounds,
layout gaps, direction, and freeform surface bounds now publish through the incremental geometry
service and structural sessions consume that snapshot. This removes the activation-time
`querySelectorAll`, computed-style reads, and destination `getBoundingClientRect` calls while
preserving the existing region validation and document order.

On the same reference machine, warm development pointer-down handlers fell from 40–46 ms to
25–26 ms. Warm production pointer-down handlers were 23–25 ms and activation gaps were
16.7–25.6 ms. The change does **not** exit Phase 1: development activation gaps remained
33.4–43 ms, one development cold pass produced a 51 ms long task, and the production 0.5× cold
pass had a 50 ms activation gap. The fixture caveats below also still prevent treating per-pass
variance as definitive.

An exploratory replacement of dnd-kit's AutoScroller, Cursor, and PreventSelection plugins was
discarded. It reduced some warm handler samples but retained the cold/33 ms misses and duplicated
upstream lifecycle behavior, creating unacceptable auto-scroll and input-semantic risk. Future
work must keep those plugins and use owner-preserving provider isolation or another trace-proven
change after correcting the fixture.

## Remaining gap (Phase 1 not yet exited)

The repeatable >32 ms activation gap is smaller but still present in three places on this
reference machine:

- development structural-sort at 0.5×/1× (33–42 ms warm, ~58 ms cold with one cold long task);
- production structural-sort cold first drag at 0.5× (33.4 ms);
- production root-drag cold first drag at 0.5× (33.4 ms, previously 17.6 ms — the deferred
  broadcast now lands in its own first frame while cold).

Timeline traces place the remaining in-dispatch cost at the dnd-kit overlay/start flush and the
cold-path React/JIT tail. Destination region reads are no longer part of session activation.
Candidate next steps are to correct the profiler fixture, keep dnd-kit's start flush cheap through
provider isolation that preserves its lifecycle plugins, and re-examine the cold-path tail.

## Fixture caveats discovered while measuring

- The out-and-back gesture is **not** document-stable for structural-sort: releasing at the
  pointer origin commits a reorder (the handle moved ~298 px between passes), so pass 1 and later
  passes drag from different document arrangements. Comparisons remain valid at the label level
  but per-pass deltas partly reflect layout differences.
- structural-sort at 2× zoom and nested-freeform at 1×/2× never activate a drag in the current
  fixture (handler ≈0 ms, no mutations), so those cells measure canvas hover only.

Both caveats belong to the profiler fixture, not the package, and should be addressed when the
profiler next changes.

## Fixture correction — 2026-08-10

The `phase-1-fixture` and stricter `phase-1-fixture-activation` runs resolve both caveats above.
The profiler now measures each movement handle, centers the full gesture away from dnd-kit's
window auto-scroll region, restores the canonical matrix document between passes, and fails the
run unless every pass records all 96 pointer moves, publishes the scenario's expected workspace
interaction owner, and leaves page scroll unchanged. The final development and production traces
each contain all 27 declared scenario/zoom/pass cells with the expected activation owner, no
missing mutations, and no page-scroll contamination.

The corrected measurements confirm that Phase 1 remains open. In the final run, development
structural-sort pointer-down spans 43.5–55 ms with 49.6–66.6 ms activation gaps, and
nested-freeform spans 41.9–48.6 ms with 49.9–58.4 ms activation gaps. Production is substantially
better: root drags stay at 7.3–11.4 ms, nested freeform at 19.2–29.7 ms, and structural sort at
21.3–34.3 ms; one structural-sort cell and one nested-freeform cell exceed 32 ms. These corrected
results supersede the invalid cells described above and make the remaining target explicit:
remove the development-only structural/freeform activation stall without replacing dnd-kit's
lifecycle plugins.

## Deferred-selection/frame-flush experiment — discarded 2026-08-10

The `phase-1-selection-defer`, `phase-1-activation-offload`, `phase-1-frame-memo`,
`phase-1-noise-check`, and `phase-1-frame-flush` traces record one bounded experiment. It deferred
non-additive host selection commits, memoized recursive tree bindings, cached validation of
immutable document snapshots, delayed drag-overlay content, and forced the already-deferred owner
and feedback renders to commit inside their scheduled frames. The experiment was useful
diagnostically: final development pointer-down spans fell to 17.2–27.2 ms for structural sort and
18.7–25.7 ms for nested freeform, while production stayed at 17.7–29.1 ms and 14.4–24.3 ms
respectively, with no long tasks.

It did not clear the Phase 1 gate. The final development trace still contains repeatable
32.9–42.7 ms activation gaps, and a default-playground workflow reproduced `root-layout`
ownership remaining active after pointer-up while the bundle was applied. Because the changes
also altered host selection timing and drag-overlay lifecycle, the runtime bundle was discarded in
full. Retain the traces as negative evidence; do not retry this combined selection deferral,
frame-flush, validation-cache, memoization, or overlay-offload approach. The next change must
preserve callback timing and upstream lifecycle while proving a different measured owner.

## Selection distribution store — landed 2026-08-10

CPU attribution (CDP `Profiler`, 100 µs) against the corrected fixture isolated the dominant
in-dispatch owner: dragging an **unselected** section commits a selection on pointer-down, and that
commit lived in workspace-root React state, so the whole workbench (root, adapter, ReactFlow shell,
toolbar, minimap, overlays, and the affected branch) rerendered synchronously inside the dispatch.
Measured control: development structural pointer-down span 34.1 ms unselected versus 11.0 ms with
the section pre-selected, with ~16 ms of raw JSX element creation in the unselected span.

The fix follows the plan's sanctioned "narrow React subscriptions" direction and the ratified
activation-store architecture: selection state now distributes through
`WorkspaceSelectionStore` (`workspace-selection-store.ts`). Selection decisions (resolution,
visibility reconciliation, rejection) stay in workspace-root's `commitSelection`, which publishes
synchronously in the same dispatch — callback timing, announcements, and gesture lifecycle are
unchanged. Consumers subscribe narrowly: frames and resize controls read per-section primitives
through `useWorkspaceSectionSelectionState`, the selection overlay and the live announcement region
subscribe individually, and imperative readers (session creation, keyboard/root drag start, marquee
baseline, action menu, controller) read `getSnapshot()`. Root/adapter/tree renders no longer depend
on selection at all; node-level `selected` (upstream block-drag membership) and selection-blocked
`draggable` reapply through one identity-preserving `setNodes` that skips the write when nothing
changed. Dropping `node.selected` entirely broke selected-block root dragging — upstream reads it
to assemble `draggedNodes` — so it is store-driven, not removed.

`phase-1-selection-store` (13:07 development, 13:09 production) records the result:

| Build       | Metric                             | fixture-activation     | selection-store            |
| ----------- | ---------------------------------- | ---------------------- | -------------------------- |
| development | structural-sort pointer-down       | 43.5–55 ms             | 22–33.6 ms                 |
| development | structural-sort activation max gap | 49.6–66.6 ms           | 25–41.8 ms                 |
| development | nested-freeform activation max gap | 49.9–58.4 ms           | 33.4–43.1 ms               |
| development | root-drag activation max gap       | 25–40.8 ms (4 > 32)    | 10.1–33.3 ms (1 cold > 32) |
| development | long tasks ≥50 ms                  | most structural passes | none anywhere              |
| production  | structural-sort activation max gap | 15.6–33.3 ms (1 > 32)  | 16.7–33.3 ms (1 cold > 32) |
| production  | nested-freeform activation max gap | 9–33.1 ms (1 > 32)     | 9.8–25.6 ms (0 > 32)       |

All structural gates stayed green: the package vitest suite (534), and the selection,
selection-actions, section-state, root-movement, recursive-keyboard, recursive-grouping,
visual-matrix, and nested-freeform-contract browser workflows.

Remaining gap: development structural/freeform activation still shows one repeatable 33–43 ms gap
per pass (two skipped frames), with in-dispatch handler spans of 21–34 ms. Timeline placement:
(a) the residual dispatch cost is dnd-kit's start work (scroller `elementFromPoint`, Feedback
measurement/`getBoundingClientRect`, overlay flush) plus session build — the selection render is
gone; and (b) the deferred ownership broadcast still commits an adapter-wide React render
(canvas data attributes, gesture policy, announcements) in the first frame after pointer-down,
which in development costs enough to skip that frame. The next owner-preserving change is to narrow
the ownership broadcast the same way (store-driven canvas attributes and gesture flags) without
changing the committed state sequence.

## Ownership-broadcast store distribution — landed 2026-08-10

This change removes owner (b) above: the deferred ownership broadcast no longer commits any
adapter render. `useWorkspaceInteractionOwner` now holds no React state — ownership decisions stay
in the hook's synchronous ref/stage sequence, and every presentation consumer subscribes narrowly
to `WorkspaceInteractionActivationStore`:

- The extracted `WorkspaceCanvasFlow` (workspace-canvas-flow.tsx) is the only component that
  rerenders on a broadcast. It derives the viewport gesture flag (`viewportInteractionEnabled`)
  through `useSyncExternalStore` and reconciles just the upstream pan/zoom props.
- The gesture-scoped canvas data attributes (`data-workspace-interaction-owner`,
  `-section-move-input`, `-structural-move-mode`) render once as idle literals and update
  imperatively from a store subscription, so the profiler's attribute-mutation activation signal
  is unchanged.
- The structural live region and the selection overlay subscribe individually (a new announcement
  channel on the activation store replaces the hook's announcement state; starts still announce in
  the deferred broadcast frame, finishes synchronously).
- Viewport pan/move/end handlers read `viewportInteractionEnabled` from the published snapshot at
  event time instead of a render-committed policy boolean — the same values at the same
  transitions, without requiring a rerender to update a closure.
- `nodesDraggable` is now static (`layoutEditable`). Every workspace node carries an explicit
  boolean `draggable` (creation and `applyRootSelectionState` maintain it) which upstream gives
  precedence, and free-move handles opt out via `noDragClassName`, so the previous per-gesture
  flips were behaviorally inert — but each flip fanned a prop change into every upstream
  `NodeWrapper`, which was a large slice of the development broadcast cost.

`phase-1-ownership-store` (13:45 development, then production) records the result against
`phase-1-selection-store`:

| Build       | Metric                             | selection-store            | ownership-store            |
| ----------- | ---------------------------------- | -------------------------- | -------------------------- |
| development | structural-sort activation max gap | 33.4–41.8 ms (8/9 > 32)    | 24–42.1 ms (4/9 > 32)      |
| development | nested-freeform activation max gap | 33.4–43.1 ms (9/9 > 32)    | 25–34.2 ms (6/9 > 32)      |
| development | root-drag activation max gap       | 10.1–33.3 ms (1 cold > 32) | 16.6–33.3 ms (1 cold > 32) |
| development | long tasks ≥50 ms                  | none                       | none                       |
| production  | structural-sort activation max gap | 16.7–33.3 ms (1 cold > 32) | 10.2–26.2 ms (0 > 32)      |
| production  | nested-freeform activation max gap | 9.8–25.6 ms (0 > 32)       | 9.4–26.5 ms (0 > 32)       |
| production  | root-drag activation max gap       | 8.4–24.8 ms (0 > 32)       | 8.5–16.7 ms (0 > 32)       |

Production now has zero >32 ms activation gaps and no long tasks in all 27 cells — the production
side of the Phase 1 exit gate is clear. Development improved (worst freeform gap fell from
43.1 ms to 34.2 ms, and most structural cells at 1×/2× are now under 32 ms) but still shows one
~33 ms gap (one skipped frame) in 10 of 27 cells. With the broadcast render gone, the timeline
places the whole remaining cost inside the pointer-down dispatch itself: dnd-kit's start flush
(scroller `elementFromPoint`, Feedback measurement, overlay flush) plus session build produce
24–33.5 ms development handler spans, which skip the next frame whenever the dispatch lands
mid-frame. Phase 1 remains open; the next owner must shrink or split that in-dispatch span without
replacing dnd-kit's lifecycle plugins or changing gating semantics.

Gates for this change: `pnpm quality` (typecheck, lint, format, boundaries, packed artifact, API
report), the package vitest suite (536), the recursive-rendering browser workflow (structural,
root, and touch ownership, announcements, rejection — 8/8), and the playground viewport-gesture
workflows (“coalesces viewport gestures”, “complete runtime gesture matrix” — 2/2).

## Measured canvas bounds — landed 2026-08-10

Trace attribution after the ownership broadcast was removed found one avoidable forced-layout
boundary in package-owned session construction. `resolveSourceGeometry` called
`geometry.canvasBounds()` after dnd-kit's start flush had already injected drag styles. That live
`getBoundingClientRect()` forced the browser to reconcile document style and layout before the
session could return.

`WorkspaceGeometryMeasurements` now retains canvas bounds from the same measurement pass used to
build its workspace-space geometry index, and `resolveSourceGeometry` reads that retained anchor.
The service refreshes the anchor during capture phase before a real section-movement activation
(primary pointer or Enter/Space on a movement handle), while document-level scroll and resize
continue to schedule a full measurement. If a silent layout shift moved the canvas, the capture
read schedules and `settleMeasurement()` performs the required re-measure before session creation.
Unrelated pointer and keyboard input does not incur the read. This preserves a self-consistent
coordinate frame while removing the post-invalidation activation flush.

The same batch corrects the structural overlay's local-freeform verb. The upstream overlay renders
before `activeSessionRef` is assigned, so it now derives freeform-parent ownership from the
document as well as the active session instead of briefly labeling a positioning gesture as a
sort.

`phase-1-measured-bounds` (15:14 development, then production) records the final filtered
capture-hook implementation against `phase-1-ownership-store`:

| Build       | Metric                       | ownership-store | measured-bounds |
| ----------- | ---------------------------- | --------------- | --------------- |
| development | structural-sort pointer-down | 23.9–33.5 ms    | 18.1–28.4 ms    |
| development | nested-freeform pointer-down | 20.5–29.6 ms    | 17.7–25.4 ms    |
| development | activation gaps above 32 ms  | 10/27 cells     | 5/27 cells      |
| development | worst activation gap         | 42.1 ms         | 35 ms           |
| development | long tasks at or above 50 ms | none            | none            |
| production  | activation gaps above 32 ms  | 0/27 cells      | 0/27 cells      |
| production  | long tasks at or above 50 ms | none            | none            |

The package geometry lifecycle/root-movement unit gate (17 tests) and the directly affected real
Chromium workflows (root pointer/keyboard movement, structural ownership, and exact sort/free-move
commits, 3/3) are green. Full deterministic quality is also green: formatting, lint/complexity,
file lengths, typecheck, boundaries, dependency policy, dead-code analysis, 539 unit tests,
automation tests, builds, package inventory, and API report. Production remains fully inside the
Phase 1 budget. Development improves materially but does not clear the exit gate: structural sort
at 2× repeats a 33.4 ms skipped frame in two of three passes, and the overall development maximum
is 35 ms. Phase 1 therefore remains open. Do not retry canvas-bounds caching, capture-anchor, or
geometry-index variants; the remaining target is the narrower upstream dnd-kit start/session work
and its frame alignment, without replacing lifecycle plugins or changing gating semantics.
