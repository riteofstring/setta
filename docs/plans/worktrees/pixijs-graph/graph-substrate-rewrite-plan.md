# Graph Substrate Rewrite Plan

Date: 2026-04-02
Updated: 2026-04-07
Worktree: `pixijs-graph`
Current branch: `pixijs-graph`
Execution base: `main`
Research source worktree: `setta.pixijs-rewrite`
Related handoff: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-handoff.md`
Related history: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`
Related summary: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`

## Goal

Replace the current `xyflow`-anchored graph substrate on the hot `settings` path with a custom graph/runtime surface that:

- preserves current product behavior
- makes pan/zoom/drag performant on dense scenes
- keeps DOM where DOM is actually needed
- prevents Pixi/DOM drift by removing DOM-measured scene placement as the source of truth

This plan is not satisfied by:

- making the current shared-page-runtime path slightly less wrong
- improving tiny-card appearance while normal zoom is still broken
- adding more harnesses around a renderer architecture that still redraws the wrong owner
- swapping widget libraries without changing graph-surface ownership

This plan is satisfied only when:

- one real `settings` canary path runs on the new graph substrate rather than `xyflow`
- pan, zoom, and section drag remain visually locked with no detached body drift
- DOM-backed editing and interaction remain faithful where still required
- the checked canary is not obviously slower than the DOM/`xyflow` baseline
- later Pixi ownership can be added without reintroducing DOM-sync drift

## Core architecture decision

The first rewrite is not "Pixi body rendering first."

The first rewrite is:

1. Replace the graph substrate first.
2. Keep section bodies DOM-backed at the start.
3. Make camera state and world coordinates authoritative outside `xyflow`.
4. Project both Pixi and DOM overlays from that same camera/world model.
5. Only move static visuals into Pixi after the substrate itself is proven.

## Ownership rules

To prevent the sync failures seen in `setta.pixijs-rewrite`, the new substrate must obey these rules:

- One source of truth for camera transform.
- One source of truth for node/section world coordinates.
- Pixi never measures moving DOM shells to decide where to draw.
- DOM overlays never become the authoritative source of section geometry.
- A surface has one visual owner at a time.
- DOM is reserved for heavyweight editors, text input, popups, accessibility surfaces, and other interaction-heavy overlays.
- Resting graph visuals should move toward scene ownership only after the graph substrate is stable.

## Phase order

### Phase 0: Substrate proof with DOM bodies

Build a custom graph canary for `settings` that keeps current DOM section bodies but does not depend on `xyflow` for:

- camera state
- pan/zoom
- node position
- node drag
- world-to-screen projection

Exit criteria:

- one normal-zoom section remains visible and attached while dragging
- the canvas can pan and zoom without detached DOM/body drift
- existing DOM body content remains usable on that slice

### Phase 1: Expand custom substrate coverage

Broaden the canary to more sections and more interactions while still using DOM section bodies where needed.

Exit criteria:

- `All Settings` can run on the custom substrate with stable drag/pan/zoom
- the custom substrate is not obviously worse than the old path for the checked slice

### Phase 2: Move static graph visuals into Pixi

After the substrate is stable, move scene-owned visuals into Pixi:

- card shells
- section chrome
- edge strips
- non-editing body visuals

Exit criteria:

- the visual owner changes without reintroducing drift
- DOM remains overlay-only for active editors and complex controls

### Phase 3: Tighten parity and performance

Once ownership is correct, chase the remaining visual and performance work:

- spacing/text/chrome parity
- motion cost
- overlay polish
- focused DOM/Pixi split decisions

## Initial canary scope

The proving route is:

- `settings`
- `All Settings`
- one normal-zoom section first

Explicitly defer until later:

- tiny-card and far-zoomed-out polish
- full-section Pixi body rendering
- `pixiui` adoption
- widget-library swaps
- final pixel-perfect parity

## Initial implementation slices

The first few Ralph slices should follow this order:

1. Create a narrow custom graph runtime seam for `settings` while leaving `xyflow` as the default path elsewhere.
2. Add tested camera/world/screen transform helpers and a stable custom viewport state model.
3. Render one `settings` section body through the new substrate using the existing DOM body implementation.
4. Implement section drag on that custom substrate without detached body drift.
5. Add pan/zoom on the same slice and prove DOM overlays remain locked to the same transform.
6. Only after that, expand section count and consider scene-owned Pixi visuals.

## Testing discipline

Every work item should follow:

1. baseline/context read
2. tests for the intended substrate behavior
3. implementation
4. narrow verification
5. CDP visual check when UI behavior changes
6. handoff refresh and history append

Priority tests for the first phase:

- world-to-screen transform unit coverage
- camera inverse transform coverage
- drag updates on the custom substrate
- a Playwright canary showing one section stays attached while dragging/panning/zooming

## Dynamic oracle strategy

For Gate 1 and Gate 2 live compares on the `All Settings` canary, use a graph-surface-only oracle by default.

Normalize both worktree and read-only `main` before judging renderer drift:

1. close or minimize non-target pane/chat chrome
2. set active view mode to `All Settings`
3. clear viewport to `null`
4. trigger one shared `fit view`

After normalization, compare only graph-surface outputs:

- viewport transform
- target-section rects
- neighboring section geometry
- graph-surface screenshots or cropped metrics

The shared Playwright parity probes are the primary oracle for those normalized lanes. Chrome DevTools MCP remains a required visual confirmation layer, but it should confirm the post-state instead of being the default mechanism for replaying fragile wheel or drag input from scratch.

Do not treat these as renderer evidence unless the current slice is explicitly about them:

- overview ordering
- whole-page scroll position
- worktree-label chrome
- other non-target workspace chrome

If a dynamic compare needs the same subject on both sides, pick a shared section by name or id and align that section locally inside the graph surface before acting. Do not rely on overview order or page scroll to choose the compare target.

Each active lane must name one canonical target section in the handoff/history. Use `findSharedVisibleSettingsGraphSection(...)` only to bootstrap a brand-new lane when no named target has been proven yet.

Trusted normalized `All Settings` parity lanes:

- shared `clear viewport -> fit view` landing on one named section
- named-section authoritative viewport override / restoration
- named-section toolbar zoom or modified-wheel zoom where Playwright drives the motion and CDP only confirms the post-state visually
- named-section blank-pane pan or top-level drag on a lane that already has a deterministic Playwright oracle
- named-section post-motion attachment/editing checks backed by one deterministic Playwright probe

Known-untrusted compare shapes:

- ad hoc CDP modified-wheel replay as the only zoom oracle
- ad hoc CDP drag/drop or pane-pan replay without a paired deterministic Playwright lane
- compare targets chosen from overview ordering, DOM order, first visible section, or page scroll
- reused-session stale viewport/state snapshots treated as fresh parity evidence

Before a parity lane is allowed to claim renderer drift, both worktree and read-only `main` must pass a hard preflight:

- expected surface kind is mounted
- compare pane state matches the normalized oracle state
- active view mode is `All Settings`
- the named target section exists
- the shared targeted `fitView(...)` path returns `true` when the lane requires it

Classify preflight failures explicitly:

- `worktree_unhealthy`: the live worktree failed preflight, so recover or narrow the setup before making renderer claims
- `reference_unhealthy`: the read-only `main` reference failed preflight, so refresh/restart the reference runtime before making renderer claims

Oracle-noise classes alone do not justify `REPLAN_REQUIRED`. The next bounded slice should either narrow the oracle further or add one non-product normalization helper that directly unblocks a renderer question.

Lane budget rule: after two oracle-only or probe-only passes on the same named lane, the next pass must either land product code on that lane or close it as unsupported/untrustworthy for the current tool stack. Do not spend a third pass re-proving the same setup.

## Replan decision

The normalized Gate 1 / Gate 2 motion/editing lane matrix has now done its job.

Recent Ralph items `165` through `169` closed the remaining named blank-pane pan, spreadsheet motion/editing, and broad shared title-edit lanes on live worktree versus read-only `main` surfaces. Those probes remain valuable regression coverage, but they are no longer the active product frontier.

The active architectural blocker is that the canary still resolves too much scene geometry from measured DOM size feedback inside the substrate implementation:

- `settingsGraphSubstrateCanarySceneRuntime.ts` still builds the scene snapshot from `useSectionElementSizes(...)`
- `settingsGraphSubstrateCanarySceneSnapshot.ts` still treats measured section element sizes as `resolvedSize` for non-layout sections
- `settingsGraphSubstrateCanaryNodeSync.ts` still mirrors those measured sizes back into `nodeInternals`

That contradicts the rewrite ownership rule that graph placement should not depend on DOM-measured scene placement as the source of truth. Continuing to add section-specific parity probes before changing that seam would be probe churn rather than rewrite progress.

From this point:

- do not add new section-specific Gate 1 / Gate 2 parity probes unless an existing broad deterministic lane fails
- treat the current parity probe matrix as regression coverage, not as the default next-slice picker
- spend the next iterations on making section geometry authoritative outside the canary's local DOM observer path

## Current tactical replan

The loop has now also spent several iterations on standalone lifecycle / CDP recovery after the broad normalized `rotaryParamCodeObjDefault` lane already stayed green. That support work was justified once, but repeating it as the default next slice would be the same kind of churn the earlier replan was meant to stop.

Progress review checkpoint after loop iteration `31`:

- runs `022` through `029` were still meaningful rewrite progress because they removed measured-DOM authority from the controller bootstrap, node-sync, scene-snapshot, shared-node observation, and shared-node seed-precedence paths
- runs `030` and `031` were diminishing returns on the same stale-seed-pruning slice because both passes repeated lifecycle / CDP recovery after focused tests were already green and neither pass produced new product evidence beyond `debugPortPid: null` / no listening DevTools sidecar
- that exhausts the default recovery budget for this exact slice; the next pass must be a bounded commit-or-stop verification attempt rather than another general recovery iteration

From this point:

- allow at most one bounded CDP/lifecycle retry per new product slice, or when the live worktree/reference runtime is genuinely unhealthy
- do not spend standalone iterations on parity or transport cleanup for a lane that already has repeated green deterministic evidence unless the runtime itself is down
- treat the current DOM-backed canary as the viewable baseline to preserve while the next architectural milestone lands
- treat the first visible Pixi shell baseline as landed; do not keep peeling shell affordances one by one unless the next pass also tightens geometry authority underneath that shell
- on the pending stale-seed-pruning slice from items `264` / `265`, spend at most one fresh outer-loop iteration on lifecycle bootstrap plus immediate CDP preflight; if the sidecar is healthy, run only the bounded canary-health gate and commit the slice
- if that fresh bootstrap still leaves `debugPortPid: null` or no reachable DevTools target, stop the automation for a tooling replan instead of spending a third lifecycle-only iteration on the same slice
- do not stack new geometry-authority code on top of the unverified stale-seed-pruning slice

Fresh outer-loop run `001` on 2026-04-07 restored the worktree DevTools sidecar and cleared that commit-or-stop lane in item `267`, so the stale-seed-pruning slice is no longer the blocker. The next passes should go back to the product frontier: remove the remaining measured-DOM authority paths under the now-verified shell baseline instead of reopening tooling-only recovery work on the completed slice.

## Branching decision

This worktree already starts from `main`, and it should stay there.

Rules:

- do not port the old shared-page-runtime architecture into this branch
- treat `setta.pixijs-rewrite` as research only
- cherry-pick or manually port only useful tests, measurements, and architectural learnings

## Immediate next frontier

The first visible Pixi insertion is now in place, so pivot from shell-chrome buildup to authority cleanup under the new shell baseline:

1. Do not reopen the completed controller split from Ralph item `205`; `SettingsGraphSubstrateCanary.tsx` is already a view shell and that prep boundary is in place.
2. Do not reopen the completed DOM-only shell/header/body seam-lift lane from items `228` through `233`; those contracts are regression coverage and future scene-owned inputs, not the next default slice picker.
3. Treat the first Pixi shell baseline as landed: border, outline, fill, top drag handle, and surface frame now render from the root Pixi shell canvas while section bodies remain DOM-backed.
4. The next real frontier is geometry authority under that shell. Start in `settingsGraphSubstrateCanarySceneRuntime.ts`, `settingsGraphSubstrateCanarySceneSnapshot.ts`, and `settingsGraphSubstrateCanaryNodeSync.ts`.
5. The first authority-cleanup slice is now landed for `sectionModel` geometry: once a section already has positive model width/height, do not keep it subscribed to `useSectionElementSizes(...)` or let measured fallback override its resolved size.
6. Narrow the next slice to the remaining measured paths on the broad `rotaryParamCodeObjDefault` lane: keep `layout` and `sectionModel` sizes on non-measured paths, and leave DOM measurement only where no stronger `sharedNode` / unresolved size authority exists yet.
7. Keep the broad normalized `rotaryParamCodeObjDefault` lane plus the current shell-owned Playwright/CDP checks as regression coverage; do not open another affordance-specific shell visual lane by default.
8. Do not spend more iterations on `settings-view-modes.spec.ts` cleanup-only `finally -> /setViewport` timeouts, standalone lifecycle cleanup, or harness-only work unless a live runtime is genuinely unhealthy or a future product slice fails before cleanup.
9. The stale-seed-pruning lane from items `264` / `265` cleared in item `267`; do not reopen it unless a later regression shows stale `sharedNode` seeds surviving after non-`sharedNode` authority takes over.
