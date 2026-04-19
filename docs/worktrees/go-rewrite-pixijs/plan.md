# Go-Rewrite Pixi Canvas-First Plan

Date: 2026-04-17
Worktree: `go-rewrite-pixijs`
Execution base: `origin/go-rewrite`
Related research:
- `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
- `docs/plans/worktrees/pixijs-graph/graph-substrate-panzoom-pivot-plan.md`
- `docs/notes/performance/frontend-performance-branches-retrospective.md`
- `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`

## Goal

Make `settings` `All Settings` pan/zoom feel excellent on dense scenes while preserving one-click editing and stable visual continuity.

This plan is not satisfied by:

- another broad DOM-flattening pass on the existing always-live widget tree
- a renderer experiment that still keeps almost all visible widget DOM live
- a canvas path that introduces visible blur, obvious pop-in, or a second click to edit
- proving only one narrow canary while `All Settings` remains bad

This plan is satisfied only when:

- dense `All Settings` pan/zoom is materially faster on the new path
- the default visible graph surface is cheap enough to stay smooth when most sections are visible
- editing begins on the first click for representative heavy controls
- activating editing does not shift layout or visibly swap outer control chrome
- the number of live heavyweight DOM editors stays tightly bounded

## Working conclusions from prior branches

Comparison baseline for side-by-side checks in this worktree:

- use `/home/ubuntu/dev/setta` as the read-only reference worktree path when a reference-side compare is needed
- that checkout is currently on branch `go-rewrite` and is the temporary pristine oracle until `go-rewrite` merges back into `main`
- do not assume an `origin/main`-based reference worktree for this restart

The existing branch history should be treated as already-paid research:

- The dominant cost is the live param-row/widget subtree, not the top-level React Flow shell.
- Large DOM cleanup was useful but did not solve the hot path.
- Simple viewport culling is not enough for `All Settings` because most of the project can be visible at once.
- Renderer rewrites that still keep visible DOM fully live do not automatically win.
- Exact-live DOM plus compositor promotion can hit strong motion numbers, but the prior path still carried blur/raster tradeoffs and did not resolve the deeper architectural issue.

From this point:

- Do not reopen the old frontend-performance branch family as the primary template.
- Do not treat offscreen culling as the main answer for `All Settings`.
- Do not treat the older shared-runtime Pixi body path as the model to continue.

## Go-rewrite preservation rule

`origin/go-rewrite` is the source-of-truth product architecture for this restart.

What that means in practice:

- Keep the `go-rewrite` section/data model, routing, store, and product refactors intact by default.
- Treat prior Pixi/frontend-performance branches as research inputs, not structural bases to copy wholesale.
- Port only proven ideas, instrumentation, and narrowly scoped code when they fit the `go-rewrite` architecture.
- Do not revert broad `go-rewrite` refactors just to make an older Pixi experiment easier to transplant.
- If a proposed perf slice appears to require backing out a major `go-rewrite` structural change, stop and record that as a replan decision instead of silently undoing the rewrite.

## Architecture decision

The default graph surface should become Pixi-owned.

Target ownership split:

- Pixi owns:
  - camera
  - pan/zoom
  - section shells
  - row chrome
  - labels and resting text
  - selection/hover/highlight states
  - resize/drag affordances
  - minimap/background/grid
- DOM owns only:
  - active heavyweight editing surfaces
  - popups/menus/combobox lists
  - rich text/code editing
  - accessibility surfaces that are not practical in Pixi

The default visible state should no longer be a live widget forest.

## UX bar

This branch is explicitly not allowed to hide UX debt behind "performance-first" excuses.

Required behavior:

- no second click to edit
- no obvious load/mount pop-in
- no layout shift when a control becomes editable
- the outer row/control chrome should remain visually stable when editing begins
- heavy editors may mount in DOM, but they must appear in-place and immediately usable

Interpretation:

- the visible shell and bounds of a control should stay stable across resting and active states
- the DOM editing overlay should replace only the interaction core, not the whole row shell

## Core hot-path invariant

During pan/zoom on `All Settings`, cost should scale mainly with:

- visible scene primitives
- one retained camera transform
- a very small number of active DOM editors

It must stop scaling with:

- total mounted parameter rows
- total mounted text/code widgets
- broad React subscription fanout across visible inactive sections
- DOM layout/paint of full section bodies during motion

## Scope

Primary proving surface:

- `settings`
- `All Settings`

Primary section families:

- param-heavy sections first:
  - `Callable`
  - `Dict`
  - `GlobalVariables`
  - list/object-style param sections where they share the same row/widget stack

Secondary families:

- code-like sections
- sparse special-purpose sections

## Phase plan

### Phase 0: Bootstrap lock-in

Goal:

- run Ralph against the new worktree doc set instead of the inherited `pixijs-graph` files
- keep the supervisor loop healthy on `go-rewrite-pixijs`
- lock the `go-rewrite` preservation rule into the plan/handoff/guardrails file

Exit criteria:

- `RALPH.md` points at `docs/worktrees/go-rewrite-pixijs/{plan,handoff,log}.md`
- the loop can run from the new worktree
- the preservation rule is explicit in the active handoff and guardrail documents

### Phase 1: Baseline and measurement restoration

Goal:

- recreate the canonical `All Settings` benchmark and profiling workflow on the `go-rewrite` base before changing product code

Required reads:

- current `All Settings` pan/zoom metrics
- DOM node counts
- representative long-task totals
- motion capture artifacts

Exit criteria:

- one durable before-change perf report exists under `perf/reports/frontend/`
- the benchmark and CDP verification flow work from the new worktree

### Phase 2: Pixi-owned camera and graph surface shell

Goal:

- remove `xyflow` from hot-path camera ownership on the canary path
- render section shells and stable row chrome in Pixi as the default visible state

Explicitly allowed:

- keep DOM editing overlays out of scope for most controls at first

Exit criteria:

- `All Settings` can render through the Pixi-owned surface with stable pan/zoom
- section shells and row geometry remain visually coherent during movement

### Phase 3: In-place active editing overlays

Goal:

- prove that at least one representative heavy control can transition from Pixi resting state to in-place DOM editing with no second click and no shell/layout jump

Representative controls:

- one text param
- one code/text-area path
- one combobox-like path

Exit criteria:

- first click focuses editing
- outer row shell remains visually stable
- no obvious pop-in or relayout is visible under CDP

### Phase 4: Dense family rollout

Goal:

- move the dominant visible inactive content for param-heavy sections to Pixi-owned resting rendering
- keep live heavyweight DOM bounded to active editors only

Required metrics:

- total visible sections
- active DOM editor count
- total DOM node count in active overlays
- average/max frame duration
- long-task totals

Exit criteria:

- `All Settings` shows a real improvement over the `go-rewrite` baseline
- the dominant visible inactive row/widget cost is no longer paid as full live DOM

### Phase 5: Parity hardening

Goal:

- close the most obvious resting-vs-active visual mismatches
- tighten typography, spacing, and interaction fidelity where needed

This phase is not allowed to start until the dense-scene motion result is already materially better.

## Acceptance gates

The branch should only be considered successful if all of these are true:

1. `All Settings` pan/zoom is materially better on the new path.
2. Visible inactive content no longer behaves like a full live widget tree.
3. Editing still begins on first click for representative heavy controls.
4. The outer control shell does not visibly jump when editing starts.
5. CDP checks do not show obvious pop-in, blanking, or detached content.

## Initial implementation slices

Use this order unless a fresh measurement disproves it:

1. Lock the worktree onto this plan/handoff/log set and preserve `go-rewrite` as source of truth.
2. Restore baseline benchmark/probe flow on `go-rewrite`.
3. Land one narrow Pixi-owned camera/surface seam on `settings`.
4. Prove one in-place active DOM editor with no second click.
5. Expand only after dense-scene measurement moves.

## Current sequencing checkpoint

As of the 2026-04-20 progress review after run `044`:

- The recent stretch is still worthwhile, but the default frontier changed again after run `041`. The canonical lane still sits above the real `33.3ms` goal, yet the latest trusted reruns kept the same dense DOM/canvas shape (`documentNodeCount 5494`, `inputCount 3`, `textareaCount 1`, `buttonCount 47`, `canvasCount 1`) while pushing `longTasks.totalMs` down from the clean checkpoint's `5844` toward `3565` on run `042`, `2993` on run `043`, and `3256` on run `044`. Treat that as real hotspot progress, not completion.
- Runs `034` through `040` were not wasted, but they closed the current retained-backdrop invalidation family as a default target. Observer churn, mutation-refresh churn, motion-hidden subtree detach / restore, unconditional settle-flush churn, header/menu viewport subscription fanout, and same-scene backdrop node-map repaint are all either removed or demoted behind stronger evidence.
- Run `041` is the durable attribution pivot: the saved trace on the canonical `settings-section__browserSectionDefault` lane pointed more strongly at `_SectionContainerCore` / `_SectionContainerCoreResizable` viewport-interaction rerender work than at another `SectionShellBackdropCanvas` paint/layout pass.
- Runs `042` and `043` then removed the direct `viewportInteractionActive` subscriptions from both section-container layers while preserving the motion-hidden DOM contract and the trusted live chrome inventory. Run `044` followed by memoizing the `SectionContainerCoreResizable` chrome/body children so active-section flips without a motion-hidden change no longer rerender the header or browser-area subtree. Treat those as real local hotspot reductions, not just internal cleanup.
- The remaining blocker is now narrower. The next plausible cost is another local `SectionContainerCoreResizable` active-section or non-viewport prop-fanout path beyond the now-memoized chrome/body boundary. Another generic backdrop, observer, DOM-sync, or repeat child-memo micro-pass would be churn by default.
- The repeated headless transparent-canvas samples are still verification ambiguity, not proved product regressions. Keep them explicit, but do not let them force a rollback unless a more trustworthy visual path reproduces the blank graph.

Required order from here:

1. Start each default pass from the chat-normalized dense `settings` -> `All Settings` probe on the named `settings-section__browserSectionDefault` lane, not from a previously closed section-local cleanup lane.
2. Keep using `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the current clean whole-scene checkpoint (`documentNodeCount 5494`, `raf.meanMs 42.58`, `longTasks.totalMs 5844`). Treat later reruns as hotspot-evidence slices unless they are clearly cleaner on the same normalized runtime.
3. Treat these default lanes as closed unless a visible regression or fresh evidence explicitly reopens one:
   - shared row-body/article-chrome cleanup from the April 19 ranking
   - selector-cache / viewport-persistence / `ZoomPane` wheel-event micro-passes
   - another browser/code/prompt lightweight nested-children widening for the same family
   - another shell-only sibling promotion derived only from the old DOM ranking
   - another `SectionShellBackdropCanvas` observer / snapshot / map-equality micro-pass by inertia
   - another pass that only re-proves the `SectionContainerCore` or `SectionContainerCoreResizable` viewport start/stop DOM-sync path
4. The next default pass must do exactly one of these:
   - land one bounded product slice that removes another remaining `SectionContainerCoreResizable` active-section or non-viewport prop-fanout rerender path on the canonical lane
   - if code inspection cannot isolate that path confidently, land one bounded evidence slice scoped specifically to `SectionContainerCoreResizable` and its immediate children, not to `SectionShellBackdropCanvas` or `ZoomPane`
5. A successful evidence slice is only successful if it ends with one concrete next product candidate inside `SectionContainerCoreResizable`, not “do more research.” Required outputs:
   - one fresh dense rerun on the canonical lane
   - one saved trace or instrumentation artifact tied to the same runtime
   - one trustworthy visual confirmation path for the retained graph on that runtime
   - one named follow-up target such as active-section decoration churn, resize-affordance prop churn, nested child prop fanout, or another similarly local container-owned path
6. If one bounded evidence pass still cannot produce a credible `SectionContainerCoreResizable` product slice, stop automation and escalate to a broader architecture decision instead of reopening backdrop invalidation, DOM-sync, or selector-cache lanes by inertia.
7. Do not treat a headless transparent-canvas sample by itself as proof of product breakage. If the blank retained graph reproduces on a trustworthy visual path, then treat that as a blocker and stop for a deeper renderer replan before landing more ownership work.

Do not let Ralph treat the current `~43ms` band as success just because it is better than the earlier triple-digit frame times. The latest long-task drop is useful evidence, but the loop is only still worthwhile if the next pass stays narrowly focused on the remaining section-container rerender fanout.

## Testing discipline

Every meaningful slice should include the narrowest relevant verification, but the branch does not get to claim progress on the main goal without a dense `All Settings` measurement path.

Prefer:

- durable Playwright or app-driven perf probes where possible
- CDP performance traces for hotspot confirmation
- append-only perf reports under `perf/reports/frontend/`
- append-only loop history under `docs/worktrees/go-rewrite-pixijs/log.md`

## Explicit deferrals

Do not spend early iterations on:

- looks-only polish before motion improves
- complete renderer parity for sparse/non-dominant section families
- speculative browser-flag rendering paths
- broad DOM cleanup as the primary lane
