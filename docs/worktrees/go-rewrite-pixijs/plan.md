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

As of the 2026-04-19 resting-body replan checkpoint:

- The retained-canvas direction is real, not speculative: the normalized dense chain moved the branch from the durable baseline of `9553` / `92` / `521` (`documentNodeCount` / `inputs` / `buttons`) and `raf.meanMs 204.93` / `raf.p95Ms 216.7` / `longTasks.totalMs 36337` to the current best clean checkpoint of `7670` / `2` / `39` and `raf.meanMs 102.6` / `raf.p95Ms 183.4` / `longTasks.totalMs 16510`.
- The later recovered-runtime `7701` / `4` / `53` report remains useful only as section-scoped ownership proof for the chat-windowing/dropzone/plugin slice; do not treat it as the new apples-to-apples benchmark because extra non-target workspace chrome reopened during recovery.
- Those gains are still not good enough for the branch goal: `settings` -> `All Settings` pan/zoom remains poor in absolute terms, and the branch still misses the `33.3ms` budget on far too many frames.
- The callable, dict, GlobalVariables, `sectionSizingPolicy`, `gui`, backend ordinary-dropdown, backend switch-family, shared activator, and generic resting-text family micro-lanes should all be treated as closed at their current ownership boundaries unless a fresh visible defect appears.
- The remaining problem is no longer the old interactive-core plateau. The dominant remaining cost is the dense resting section-body / row-value DOM that still moves under viewport transforms across `All Settings`.
- The recent frontier chain proved where the next win is not:
  - the retained switch value-shell boundary moved the remaining value surface to `87` elements across `28` rows at `documentNodeCount 6728`
  - the `languageServer` slice moved that remaining surface again to `39` / `21` at `documentNodeCount 6713`
  - the backend plain-text slice moved it again to `27` / `18` at `documentNodeCount 6704`
  - but dense motion stayed flat-to-worse across the last two frontier passes (`raf.mean 94.13 -> 94.22`, `raf.p95 166.8 -> 183.4`, `longTasks.total 14856 -> 15021`)
- Therefore the branch has exhausted survivor-family harvesting as the default strategy. The next step must remove row-body/layout cost from motion, not just another text/value leaf from the DOM tree.

Required order from here:

1. Start each new default pass from the whole `settings` -> `All Settings` dense scene, not from a previously closed micro-lane.
2. Pick only one of these two frontier classes by default:
   - a stronger shared resting row-body / value-shell primitive or ownership seam that can remove remaining `div.section-value`, `single-cell-container`, switch shell, or similar row-body DOM across multiple sections at once
   - a stronger inactive-row overlay primitive only if that is the smallest viable way to stop paying row-body layout/paint during motion
3. Prefer a broader shared row-body/value-shell primitive over another section-specific resting-text, date/time, dropdown, switch, or wrapper cleanup whenever both are available.
4. First candidate order for the next restart:
   - shared lightweight-switch row-body / value-shell ownership, where rows are already `lightweightSwitch` and the remaining cost is the visible `div.section-value` shell
   - shared lightweight color-input row-body / value-shell ownership, where the remaining cost is the `div.section-value.single-cell-container` plus icon shell
   - if neither of those is viable on the current boundary, a stronger inactive-row-body overlay primitive for the highest remaining non-lightweight family
5. Land a new code slice only if the inventory suggests it can materially move the dense probe, the remaining section-body/value DOM, or both. Convenience cleanups and local polish are not enough.
6. Do not reopen closed survivor-family lanes by default just because they still appear in the ranking. They now count only as evidence for the stronger primitive choice, not as the product slice themselves.
7. After every such slice, rerun the normalized dense `settings` -> `All Settings` probe against `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md` and compare against the current best clean checkpoint `7670` / `2` / `39` with `raf.meanMs 102.6`, `raf.p95Ms 183.4`, and `longTasks.totalMs 16510`.
8. If a proposed slice does not plausibly move those global numbers or the dense section-body/value surface before the code is written, stop and replan instead of letting the loop continue by inertia.
9. If one stronger row-body/value-shell pass still fails to materially improve absolute dense-scene motion, escalate immediately to a larger inactive-row overlay decision instead of continuing family-by-family harvesting.
10. Do not take another generic shared resting-text harvest, and do not open a date/time-specific lane by default, unless a fresh whole-scene inventory proves that move is now the highest-payoff dense frontier.

Do not reopen closed section-specific chrome ownership lanes for routine follow-up, and do not let Ralph treat the current triple-digit frame times as success just because the branch is better than baseline.

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
