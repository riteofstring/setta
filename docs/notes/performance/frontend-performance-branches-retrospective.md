# Frontend Performance Branches Retrospective

## Scope

This note summarizes the locally available `frontend-performance*` branch series:

- `origin/frontend-performance`
- `origin/frontend-performance-2`
- `origin/frontend-performance-3`
- `origin/frontend-performance-5`
- `origin/frontend-performance-6`
- `origin/frontend-performance-7`
- `origin/frontend-performance-8`
- `origin/frontend-performance-9`
- `origin/frontend-performance-10`
- `frontend-performance-11`

The goal is to capture what was attempted, what actually moved measurements, and which directions look like dead ends so we do not repeat expensive experiments without a materially different premise.

## Sources Reviewed

The report is based on:

- branch commit history and diff stats versus `origin/main`
- perf notes under `perf/reports/frontend/` and `perf/reports/backend/` on each branch
- plan docs under `docs/plans/` when they clarified the intent of an experiment

`frontend-performance-11` is not a real perf branch anymore. It points at current `main` and only contains stale Playwright expectation fixes, so it is not part of the performance analysis below. `origin/frontend-performance-9` also does not add substantive performance code.

## Executive Summary

The main result from the branch series is fairly consistent:

1. The core bottleneck is not the top-level React Flow shell, the minimap, or backend round-trips. The dominant cost is the live `All Settings` param row and widget stack: layout, paint, activation churn, and expensive interactive subtrees.
2. Reducing raw DOM node count helps, but DOM count alone is not the root cause. Several branches removed a large amount of DOM without producing a proportional pan/zoom win.
3. The only experiments that produced very large motion gains did so by changing the rendering model, not by cheaply optimizing the existing one. Examples: layer-split or shell-promotion modes, hiding inactive bodies, sparse DOM islands, or static preview surrogates.
4. Once the requirement becomes "keep everything fully live," the big wins mostly disappear. The strongest example is the canvas-engine path: it looks excellent when it keeps DOM sparse, but it is slower than the existing React Flow path once all top-level DOM is kept live.
5. Several seemingly promising rabbit holes were measured directly and should not be repeated without a new premise: subscription partitioning, lazy overlay mounting, observer/listener budget work, workerized param filtering, `content-visibility`, RAF-throttled transform propagation, code-widget-only SnapDOM, and minimap micro-tuning as a primary focus.

## Branch-By-Branch Summary

| Branch | Main idea | Measured outcome | Retrospective |
| --- | --- | --- | --- |
| `origin/frontend-performance` | Incremental cleanup on the existing tree: edge-handle updates, layout-read reduction, temporary-height batching, key-wrapper flattening, resize-handle collapse | Corrected branch-head rebenchmark finished about `-8.4%` on `All -> Core` elapsed, `-20.0%` on `All -> Core` long-task total, `-7.5%` on `Core -> All` elapsed, and `-9.1%` on `Core -> All` long-task total versus its baseline | Worth keeping as hygiene, but not a foundational fix. It improved transition cost, not the underlying `All Settings` live-render problem. |
| `origin/frontend-performance-2` | Backend fast paths plus view-mode delta updates and runtime-store splitting | Backend work improved route costs, but frontend reruns still had `All Settings` pan/zoom around `32-34 FPS`, and switch-cost results were mixed. The report explicitly says it "does not move the needle enough toward the 10x target." | Important to separate from the frontend problem. Backend latency mattered for some workflows, but it was not the primary cause of bad `All Settings` motion. |
| `origin/frontend-performance-3` | Broad experiment branch: subscription partitioning, lazy overlays, observer/listener budget, filter worker, shared visibility context, viewport content-visibility, motion-shell, layer-split, RAF-throttled transform fanout | Most experiments were explicitly marked **Not kept**. Examples: subscription partitioning worsened typing median (`186.72ms` vs `164.91ms` baseline), filter worker regressed typing, `content-visibility` regressed pan/zoom, RAF throttling hurt stop hitch. Two experiments did help: layer split and motion shell both pushed motion into the `~110-120 FPS` band, but only as gated rendering modes | This branch is the clearest map of dead ends. If we revisit it, it should be only for the rendering-mode ideas, not the reverted state-partition and observer-budget ideas. |
| `origin/frontend-performance-5` | Ground-up canvas engine rewrite with GPU rendering, scene adapter, hit testing, parity work, sparse DOM islands, and many micro-optimizations | Milestone-2 engine numbers were excellent because the engine path had almost no live DOM: `321` total DOM nodes and `~8.4ms` average frame time versus the legacy baseline with `~14k` DOM nodes and `~60.3ms` average frame time. But that comparison was not apples-to-apples because full DOM section internals were not mounted yet | Good proof that sparse DOM changes the game. Not proof that a rewrite solves performance while preserving current fully-live behavior. |
| `origin/frontend-performance-6` | Aggressive DOM flattening across the existing Settings UI | Very large structural reduction: viewport descendants went from `8619` to `3915` (`-54.6%`), average descendants per node from `204.05` to `92.05`, and average/max depth from `12.74/17` to `6.07/8`. Trace drop ratios improved, but the notes repeatedly say runtime traces stayed variable | Useful evidence that flattening is directionally good, but also proof that large DOM reduction by itself is not enough. This did not magically remove the motion cliff. |
| `origin/frontend-performance-7` | Coalesce non-critical pan/zoom consumers with `renderTransform` | Minimap/background updates were cut from `180` primary viewport updates down to roughly `39-44` secondary updates, a `4.1x-4.6x` reduction in secondary mutation churn | A worthwhile cleanup, but not the main event. It trims secondary work; it does not solve live row/widget cost. |
| `origin/frontend-performance-8` | Minimap optimization ladder | Feature-preserving canvas node rendering only shrank the minimap tax to roughly `4%` versus no minimap. Larger wins required trading away live viewport feedback; removing the viewport mask made minimap-on nearly equivalent to `showMinimap=false` | Minimap work is secondary. It can shave overhead, but the branch evidence says minimap is not the dominant bottleneck once the obvious cleanup is done. |
| `origin/frontend-performance-10` | Benchmark-driven deep dive on current `main`, plus ported canvas-engine work, activation fixes, shell-promotion, SnapDOM, hidden-live-body experiments, and later engine validation | This branch produced the clearest root-cause map. The top-level shell could still run at roughly `120 FPS`, but the full widget path fell to roughly `38-43 FPS`. It also showed that code-widget SnapDOM was not a meaningful win, whole-section SnapDOM had fidelity and activation problems, shell-promotion could make motion fast, and always-live canvas-engine DOM was still slower than React Flow | This is the best decision log in the series. Its biggest value is not a single fix; it is the proof of which performance stories are false. |

## What The Series Actually Proved

### 1. React Flow itself is not the main limiter

The clearest statement is in `origin/frontend-performance-10`.

- `frame-only` and `header-only` stages stayed around `120 FPS`.
- `section-body-shell` was still around `100 FPS`.
- Reintroducing `697` lightweight rows dropped the benchmark to roughly `69-88 FPS`.
- Reintroducing the real widget layer dropped it again to roughly `38-43 FPS`.

This matters because it rules out a lot of shallow explanations. The expensive part is not "React Flow exists." It is the live param-row/widget subtree that React Flow is carrying.

### 2. DOM count reduction is helpful but not sufficient

`origin/frontend-performance-6` cut the live `All Settings` viewport subtree by more than half, which is a real and meaningful cleanup. But the branch notes still treat the runtime trace outcome as variable rather than decisive.

The practical read is:

- flattening wrappers is still worth doing
- raw DOM-count deltas are not enough to predict success
- the expensive part is bound up with layout contracts, paint, widget behavior, and activation churn, not just the number of nodes

`origin/frontend-performance-10` makes the same point more directly: the branch found cases where small DOM changes mattered more than expected, and cases where large DOM reductions did not buy enough real-motion improvement.

### 3. Backend work was mostly orthogonal

`origin/frontend-performance-2` bundled a lot of legitimate backend speedups, but the frontend-heavy view still performed badly after those landed.

The strongest frontend note from that branch is the runtime-store split rerun:

- `All Settings` transform stayed around `32-34 FPS`
- switch-time long-task results were mixed
- the branch note explicitly concluded that the work did not move enough toward the `10x` goal

That means backend fast paths are not the right primary lever for this specific problem, except where they remove specific regressions or state churn.

### 4. A lot of state-management ideas did not pay off

`origin/frontend-performance-3` is valuable because it actually tested several plausible ideas that are easy to keep re-suggesting in the abstract:

- state-subscription partitioning
- lazy overlay mounting
- observer/listener budget cleanup
- param-filter worker
- shared param-filter visibility context
- viewport `content-visibility`
- RAF-throttled transform update fanout

Those mostly ended in one of two ways:

- direct regression
- no clear win large enough to justify the additional complexity

Examples:

- Subscription partitioning worsened Playwright typing median from `164.91ms` to `186.72ms`.
- Param-filter worker showed no robust motion improvement and regressed typing.
- `content-visibility` regressed both pan and zoom.
- RAF-throttled transform fanout kept throughput near parity but made stop hitch materially worse.

This is one of the clearest "do not go back here casually" parts of the series.

### 5. Motion-mode tricks can work, but they are not free

The strongest measured wins on the legacy path came from experiments that changed how the browser treated live content during motion:

- viewport layer split
- viewport motion shell
- later, shell promotion in `origin/frontend-performance-10`

The branch series shows two different readings of that family of ideas:

- In `origin/frontend-performance-3`, layer split and motion shell were very strong motion wins, but they stayed feature-flagged or experiment-only because parity and rollout confidence were not settled yet.
- In `origin/frontend-performance-10`, gesture-scoped shell promotion was driven into production-style measurements and produced a real result: the live production `full` stage could hit about `120.20 FPS` with warmed click activation around `21.93ms` to active and `49.67ms` to visual settle.

So this family should not be classified as "did not work." It did work. But it worked as a browser/compositor strategy layered on top of the existing architecture, not as a simplification of the actual live widget workload.

That distinction matters. If the requirement is "pan/zoom must feel smooth while content stays visually live," compositor-oriented solutions remain plausible. If the requirement is "remove the underlying complexity or make fully live rendering cheap," these branches do not show that.

### 6. SnapDOM is not the magic answer

`origin/frontend-performance-10` explored multiple versions of preview-surrogate rendering.

Code-widget-only SnapDOM:

- reduced DOM by `921` nodes in the hotspot stage
- made the isolated code-widget stage worse
- improved the full stage by only about `+2.33 FPS`

The branch conclusion was explicit: this was not a large enough or clean enough win to keep.

Whole-section SnapDOM initially looked amazing, but that turned out to be partly a harness/fidelity bug. Once corrected:

- plain live `full`: `56.16 FPS`
- corrected whole-section SnapDOM: `77.06 FPS`
- corrected SnapDOM plus hidden live body: `97.30 FPS`
- plain `opacity: 0` hidden live bodies: `115.32 FPS`

Corrected SnapDOM also had expensive activation:

- about `285-307ms` average to live/usable
- about `412-461ms` average to focusable

So the final takeaway is:

- SnapDOM can improve motion if we replace large inactive subtrees
- it is still worse than simply hiding those live bodies
- it adds fidelity and activation complexity
- it is not a clean default answer

### 7. The custom canvas engine only wins if sparse DOM is acceptable

This is the most important rewrite conclusion in the whole series.

`origin/frontend-performance-5` made the canvas-engine path look extremely promising, but it did so in a sparse-DOM world. That is still useful data.

`origin/frontend-performance-10` then tested the harder requirement directly by forcing all top-level engine DOM islands live at once. That result was bad:

- React Flow full-live: `88.02 FPS` in a same-session warm rerun
- Canvas engine with always-live DOM: `45.70 FPS`

The traced pair told the same story:

- React Flow: `72.09 FPS`
- Canvas engine with always-live DOM: `36.37 FPS`

DOM size was basically unchanged between the two modes. The report conclusion is the right one: the earlier engine win was really the sparse live-DOM overlay. Once that advantage is removed, the rewrite does not outperform the current path.

That makes the rewrite decision much clearer:

- If we are willing to virtualize, hydrate, or otherwise keep DOM sparse, the engine path remains interesting.
- If we require always-live DOM for all top-level section content, the branch series does not justify a rewrite.

### 8. Some specific regressions were real and fixable

Not everything in the branch series was a dead end.

One especially concrete example from `origin/frontend-performance-10`:

- after save/autosave, wheel zoom stayed slower until refresh
- suppressing only websocket `UpdateFrontendProjectState` removed the regression
- skipping semantically identical backend project-state rewrites kept before/after-save zoom in the same `~92-96 FPS` band

This is a good example of the kind of performance fix that is worth keeping:

- narrow
- measurable
- behavior-preserving
- directly tied to a verified user-facing regression

## Rabbit Holes To Avoid Reopening

These directions were measured directly and should be treated as rejected unless the premise changes substantially:

- backend-only fast paths as the primary answer to `All Settings` pan/zoom slowness
- broad subscription partitioning for Settings rows
- lazy overlay mounting as a major fix
- observer/listener budget cleanup as a major fix
- workerizing the param filter
- shared param-filter visibility context as a major fix
- viewport `content-visibility`
- RAF-throttled transform propagation
- code-widget-only SnapDOM preview replacement
- minimap work as a first-order bottleneck
- canvas-engine rewrite under an always-live DOM requirement
- row-layout rewrites that break the existing `.section-key` / `.section-value` / `.section-key-value` contract without a replacement plan

## Directions That Are Only Worth Reopening Under A Different Product Assumption

These are not "bad ideas"; they are ideas that only make sense if we explicitly accept their tradeoff:

- viewport layer split or motion-shell style modes
- gesture-scoped or always-on shell promotion
- hidden inactive section bodies
- sparse DOM islands and hydration
- whole-section surrogate previews
- a deeper canvas-engine rewrite

The tradeoff behind all of them is the same: motion gets fast by making less of the page truly live during interaction, or by moving more responsibility to compositor and hydration machinery.

## Practical Takeaways

If the product requirement stays close to the current behavior model, the branch series points to a narrower optimization agenda:

- focus on the live param-row/widget stack, especially dropdown/combobox/code paths
- keep behavior-preserving structural simplifications when they are cheap and measurable
- keep narrow regression fixes such as skipping no-op backend project-state rewrites
- use compositor-oriented motion optimizations when they are provably safe, but do not confuse them with root-cause elimination

If the product is willing to accept a different interaction model, the strongest lever is not more local React cleanup. It is some form of inactive-content virtualization, preview, or sparse DOM.

## Bottom Line

The frontend-performance branch series did not fail because nothing improved. It failed to produce a simple, behavior-preserving silver bullet.

What the series really proved is narrower and more useful:

- the bottleneck is the live Settings row/widget architecture
- many intuitive state-management and DOM-count ideas are not enough
- rewrite-scale wins come mainly from keeping less DOM live
- if we insist on fully live content, several expensive directions are already disproven

That should be enough to avoid repeating most of the exploratory work unless the product requirement itself changes.
