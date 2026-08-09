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

## Remaining gap (Phase 1 not yet exited)

The repeatable >32 ms activation gap is smaller but still present in three places on this
reference machine:

- development structural-sort at 0.5×/1× (33–42 ms warm, ~58 ms cold with one cold long task);
- production structural-sort cold first drag at 0.5× (33.4 ms);
- production root-drag cold first drag at 0.5× (33.4 ms, previously 17.6 ms — the deferred
  broadcast now lands in its own first frame while cold).

Timeline traces of the current code place the remaining in-dispatch cost at: session capture and
its one forced layout (~8 ms development), a second forced layout after dnd-kit's overlay commit
feeding `elementFromPoint` (~4 ms), and an ~12 ms development-only React sync flush originating in
dnd-kit's signal-driven start rendering (mostly shallow re-render/bailout work under StrictMode's
double render; production equivalent is a few ms). Candidate next steps: keep dnd-kit's start
flush cheap by isolating its provider subtree, source drop regions from the geometry index instead
of direct DOM reads, and re-examine the cold-path JIT tail.

## Fixture caveats discovered while measuring

- The out-and-back gesture is **not** document-stable for structural-sort: releasing at the
  pointer origin commits a reorder (the handle moved ~298 px between passes), so pass 1 and later
  passes drag from different document arrangements. Comparisons remain valid at the label level
  but per-pass deltas partly reflect layout differences.
- structural-sort at 2× zoom and nested-freeform at 1×/2× never activate a drag in the current
  fixture (handler ≈0 ms, no mutations), so those cells measure canvas hover only.

Both caveats belong to the profiler fixture, not the package, and should be addressed when the
profiler next changes.
