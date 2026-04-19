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

As of the 2026-04-20 progress review after run `032`:

- The recent stretch is still worthwhile, but only with a sharper frontier. The current whole-scene band is still roughly `documentNodeCount 5493-5498`, `inputCount 3`, `textareaCount 1`, `buttonCount 46-47`, `raf.meanMs ~43`, and `longTasks.totalMs ~5.7-6.7s`, so the branch is materially better than the older triple-digit frame-time state but still above the real `33.3ms` target with significant long-task debt.
- The stretch produced real Phase 2 product progress: run `022` hardened first-click CodeMirror activation on the retained-text/canvas-shell path, and runs `024` plus `030` widened retained-canvas shell ownership to real dense families while keeping first-click dropdown/editor handoff intact. Treat those as architecture progress, not as new whole-scene perf checkpoints.
- Run `032` landed a real shared row-body ownership step on the canonical `settings-section__browserSectionDefault` lane: the shell-owned browser/code/prompt family now keeps lightweight nested children on the canvas-owned path, the stale live-browser proof lane was retargeted to that family with `buttonParamCodeObjDefault` as the remaining negative control, and the concrete browser/code legacy nested wrapper gap is now closed on the current runtime.
- The micro-reducer lane is now exhausted as a default strategy. Runs `023`, `025`, `026`, `027`, `028`, and `029` each removed real JS/selector fanout but all settled back into the same dense band, so further viewport/`ZoomPane`/selector-cache passes are churn unless a fresh product slice directly depends on one.
- Run `031` changed the planning evidence materially: the refreshed post-run-030 trace did not reproduce the older `EventDispatch` / `v8.callFunction` / GC hotspot and only showed short `RunTask` activity, so the stale hotspot report is now closed as the default reason to spend another iteration on guessed trace-chasing.
- The strongest durable product evidence is still `perf/reports/frontend/2026-04-19_settings-all-settings-row-body-surface-ranking.md`: the moving surface still carried `2934` visible row-body descendants even after visible value roots were almost gone, with the dominant survivors being repeated row chrome, resize scaffolding, wrapper `div`s, and `p.section-key` labels rather than leftover value widgets.

Required order from here:

1. Start each default pass from the chat-normalized dense `settings` -> `All Settings` probe on the named `settings-section__browserSectionDefault` lane, not from a previously closed section-local cleanup lane.
2. Keep using `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the current clean whole-scene checkpoint. Treat later shell-ownership reports as ownership evidence and treat `perf/reports/frontend/2026-04-20_settings-all-settings-post-run-030-hotspot-refresh-report.md` as the closure of the stale hotspot lane, not as permission for another generic trace pass.
3. Run `032` closes the browser/code/prompt lightweight nested-children cluster as one real shared graph-surface ownership step. The next default pass must target the next shared row-body/article-chrome survivor on already shell-owned dense families. Default target shape:
   - canonical lane: `settings-section__browserSectionDefault`
   - first sibling proofs: existing shell-owned siblings such as the remaining code-like/button shell lane or the GUI/backend shell family
   - ownership goal: reduce repeated `div.section-center...`, `div.group/resize`, top-level wrapper `div`, and remaining `p.section-key` descendants instead of reopening the just-closed lightweight nested-children cluster or adding another isolated shell id
4. Do not spend the next default pass on another selector cache, viewport-persistence follow-up, `ZoomPane` wheel/event micro-pass, standalone hotspot refresh, another nested-children allowlist widening for the same browser/code/prompt family, or single-section shell-sibling promotion. Those lanes are closed by current evidence unless a visible regression or a concrete product slice explicitly reopens one.
5. A longer trace is now a fallback only. Take one only when a specific shared row-body/article-chrome slice is blocked and the trace is required to scope that product change; do not reopen trace-driven reducer hunting by default.
6. If the next candidate cannot name a bounded shared ownership primitive with plausible whole-scene descendant reduction on the already shell-owned families, stop and replan instead of letting the loop continue by inertia.

Do not let Ralph treat the current `~43ms` / `~5.7-6.7s` band as success just because it is better than the earlier triple-digit frame times.

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
