# Settings Pan/Zoom Hybrid Rendering Plan

Date: 2026-03-20
Worktree: `setta.frontend-performance-11`
Current branch: `frontend-performance-11-hybrid-rendering`
Current HEAD at start: `b40672176`
Related log: `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-hybrid-rendering-log.md`

## Goal

Make Setta canvas pan and zoom feel effectively hitch-free on dense projects such as `settings` while preserving the apparent product UI and UX.

The user-facing requirement is:

- no visible blur during viewport motion
- no obvious frame hitching or dropped frames during horizontal pan, vertical pan, overview zoom, or detail zoom
- no requirement for a second click to interact with a section
- no material visual regression relative to the existing section design unless an explicit visual simplification is accepted as a deliberate tradeoff

## Executive Decision

Do not treat this as an `xyflow` replacement project.

Treat this as a section-body rendering architecture project with three linked moves:

1. Reintroduce the cheaper top-level section shell behavior from the pre-regression baseline around `bf6487690` on top of current `HEAD`.
2. Keep flattening the active section-body DOM where that work is still high leverage.
3. Add a hybrid section-body LOD system so inactive bodies stop participating as fully visible live DOM during pan/zoom and low-zoom overview states.

Also split the section strategy by multiplicity and product importance instead of forcing one body-layout policy across every section type.

For Tier 1 specifically, keep the top-level section shell on the old grid-style model while still flattening and simplifying everything possible underneath it.

The intended steady-state model is:

- live outer shell at all times
- live active section body
- warm live bodies for a small high-priority set
- visually faithful preview bodies for the rest during motion and low-zoom states

## Why This Is The Recommended Direction

The strongest evidence from this worktree is:

- The main problem is browser paint/compositing on visible section-body DOM, not edge rendering and not the bare React Flow shell.
- The current branch is faster than the older shell in many main-thread categories, but much worse in `Paint` during pan and zoom.
- The branch has already demonstrated that exact-live-content pan/zoom can reach refresh-limited behavior when paint is isolated, but the previous shell-promotion fix was removed because it caused temporary blur during motion.
- Small local replacements such as code-widget-only preview swaps do not produce the class of gain we need.
- Section-level changes do produce the class of gain we need.

Primary evidence:

- `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`
- `perf/reports/frontend/2026-03-20_section-top-level-grid-benchmark.md`
- `docs/plans/worktrees/setta.frontend-performance-11/section-performance-log.md`
- fresh local trace artifacts:
  - `perf/tmp/current-settings-live-trace.json`
  - `perf/tmp/baseline-settings-live-trace.json`

## What We Are Not Betting On

- Not a full rendering-engine swap as the first move.
- Not per-widget canvas conversion as the main strategy.
- Not a requirement that every inactive section body remain fully live and visibly rendered at every zoom level.
- Not a return of gesture-time shell promotion that blurs content during motion.
- Not a global rule that every section body must keep the same flattened body-layout model.
- Not a blanket return to `subgrid` as the shared answer.
- Not any terminal-section architecture work inside this plan.

## Key Findings To Preserve

### 1. `xyflow` is not the primary bottleneck

Setta already reaches near-refresh-limit performance when only lightweight section shells are present. The major regression appears once the real nested section-body subtree is live.

### 2. The dominant steady-state cost is visible body paint

The strongest clue is the benchmark-only `opacity: 0` result on inactive bodies:

- almost the full DOM stayed mounted
- pan performance still jumped into the refresh-limited band

That means the main problem is not simply that the DOM exists. It is that the browser is painting and compositing the visible body subtree during transform motion.

### 3. The pre-regression top-level shell is still relevant

The `bf6487690` comparison showed a much cheaper pan/zoom paint profile than current `HEAD`.

That does not mean "revert everything to `bf6487690`".

It does mean the top-level shell should be restored toward that paint-friendlier behavior before or alongside the LOD work.

### 4. Small isolated canvas/image substitutions are not the answer

Prior work already showed:

- code-widget-only SnapDOM SVG previews: too little gain
- code-widget-only canvas previews: materially worse

This points away from "canvasify individual controls" and toward "change whole section-body participation in the motion path".

### 5. Whole-section-body substitution does work

The branch already demonstrated that replacing inactive section bodies with a single preview surface, or otherwise removing their visible paint participation, can produce the class of pan/zoom improvement we want.

The open problem is not whether this can work. The open problem is how to do it without:

- blur during motion
- slow activation
- a degraded click-to-interactive experience

## Section Families And Scope

This plan now explicitly separates section families by expected multiplicity on the canvas.

## Tier 1: Dense Param Families

These are the primary performance targets and should remain on the strictest DOM and paint budget:

- `Callable`
- `Dict`
- param-heavy dict variants
- list/object-style param sections
- `GlobalVariables` when it shares the same heavy param/body stack

These sections are the main candidates for:

- retaining the top-level grid-style section shell
- the most aggressive DOM flattening
- section-body LOD / preview behavior
- strict wrapper, clipping, and always-mounted-control budgets

Tier 1 rule:

- keep the top-level shell/grid contract for these sections
- avoid `subgrid` where a simpler local contract can preserve the same geometry and interaction behavior
- push the simplification work downward into the body, row, widget, and shared param-stack ownership layers

## Tier 2: Code Sections

`Code` sections stay in scope, but as a separate tier.

They should inherit:

- the shared shell improvements
- the render-mode infrastructure
- the same motion/zoom contract

But they should be profiled and optimized as their own body family, not forced into exactly the same body strategy as the dense param sections.

Working assumption:

- code sections likely still merit optimization work
- but their body cost profile is different enough from Tier 1 that they should not drive the same local body decisions

This tier also owns CodeMirror-heavy behavior in related section families even when their surrounding body layout is restored locally.

That includes:

- `Code`
- the editor/input side of `Prompt`
- the editor/input side of `TextBlock`

Out-of-scope note for this plan:

- code typing performance is acknowledged as a real problem area
- but it should remain out of scope unless the pan/zoom and activation profiling in this plan clearly points at the same root cause

## Explicitly Excluded From This Plan

- `Terminal` section architecture changes

Terminal should remain out of scope here because the desired direction for it is expected to be different.

## Sparse Section Restore Policy

For lower-count section types, the plan now allows restoring richer body layouts locally if that improves product quality and does not reopen shared hot-path costs for Tier 1 or Tier 2 sections.

Examples of likely sparse-section candidates:

- `Browser`
- `Draw`
- `Chart`
- `Prompt` body layout outside the live editor path
- `TextBlock` body layout outside the live editor path
- similar low-count special-purpose sections

This restoration policy means:

- restore body layouts locally in the owning section implementation when useful
- avoid reintroducing shared heavy body contracts that dense sections also consume
- avoid reintroducing `subgrid` unless a specific local case proves it is necessary and worthwhile

The preferred restoration model is:

- old visual/body-layout quality where useful
- without reopening shared `subgrid` or other heavy shared layout contracts where a simpler local flex/absolute contract can preserve the same appearance

Important nuance for `Prompt` and `TextBlock`:

- restoring their local body layout does not mean exempting their CodeMirror/editor path from optimization work
- the rendered-text / markdown / surrounding layout can be restored locally
- the editor path should stay grouped with Tier 2 code-section profiling and optimization

## Target Architecture

## 1. Section Shell Always Live

Keep these elements live at all times:

- section frame
- header/title
- selection outline
- drag and resize affordances
- edge handles / ports
- any minimal shell chrome needed for spatial awareness

The shell must remain sharp during motion.

Tier-specific shell note:

- Tier 1 dense param sections should keep the top-level grid-style shell
- sparse restored sections may use their own local body layout choices underneath that shared shell policy
- Tier 2 code sections inherit the shared shell policy first and then get separate body/editor profiling

## 2. Section Body Render Modes

Each section body should have an explicit render mode:

- `live`
  - real body DOM rendered and visible
- `warm`
  - real body DOM mounted and ready, but not necessarily the main visible representation
- `preview`
  - visually faithful lightweight representation used during motion and/or low zoom

This mode must be driven by deterministic source-of-truth inputs, not heuristics based on text matching or widget type guesses.

Recommended inputs:

- `viewportInteractionActive`
- current zoom
- projected on-screen section-body width and height
- section active state
- section hover / focus state
- optional warm-pool priority score derived from proximity to the active section or recent interaction

## 3. Preview Policy

Previews are allowed only when a section body is not the current interaction target and when at least one of these is true:

- the viewport is actively moving
- the section body is below a screen-space size threshold

Previews must not be relied on for arbitrary deep zoom.

Instead:

- preview while small or while moving
- switch to live before the section becomes visually important enough for softness to matter

This avoids the need for huge raster assets for every section.

## 4. Preview Substrate

The preview should be section-body-level, not widget-level.

Preferred order of investigation:

1. Faithful section-body preview surface with strong visual parity.
2. If the preview surface cannot remain crisp enough over the required zoom range, use a lightweight semantic preview DOM instead of a raster-only surface.

Deprioritized:

- converting `KwargsControls` alone to canvas
- converting row controls one-by-one to canvas
- maintaining hundreds of little canvas islands

Section-family note:

- Tier 1 dense param sections are the main preview/LOD targets
- Tier 2 code sections may use the same infrastructure, but should be evaluated separately
- sparse restored sections should only opt into preview if traces prove they need it

## 5. Preview Generation Rules

Preview generation must not happen inside the active pan/zoom gesture.

Required rule:

- generate or refresh previews only after content changes and only on idle / settled viewport states

During motion, the system should only:

- flip render modes
- toggle visibility
- swap between already-prepared representations

It must not:

- capture fresh previews
- remount heavy DOM
- do expensive body layout work

## 6. Activation Model

The product must not regress into "click once, wait, click again".

Required interaction model:

- first click on a previewed section activates it
- the same gesture must transfer the section into an interactive state without requiring a second click

To make that realistic, use a warm pool:

- active section always live
- hovered section should usually be warm
- a small nearby set should stay warm as the likely-next interaction targets

Cold activation may still exist for far-away sections, but it should be treated as an exception path, not the common path.

## Why ComfyUI Is Relevant But Not A Direct Template

ComfyUI performs well because its default graph path is canvas-first with visible-node culling and dirty front/background canvases. Even its DOM-node path is transform-aware and aggressively limits DOM participation.

Setta does not need to become LiteGraph to benefit from the same principle.

The reusable lesson is:

- keep the transform path cheap
- cull or substitute expensive body content during motion
- avoid asking the browser to repaint every detailed body subtree on every viewport transform frame

## Delivery Phases

## Phase 0: Lock The Performance Contract

Write down the contract before implementation starts.

- Preserve the current apparent section UI as the target.
- Allow implementation-level LOD and inactive-body substitution.
- Disallow temporary blur as an accepted motion tradeoff.
- Disallow a required second click to interact.
- Define warm vs cold activation targets.
- Define zoom/screen-space thresholds as explicit config, not ad hoc constants hidden in components.

Acceptance criteria:

- one written contract exists for motion sharpness, activation behavior, and preview eligibility
- no implementation starts by reintroducing blur-prone shell promotion blindly

## Phase 1: Restore The Paint-Friendlier Top-Level Shell Baseline

Use the `bf6487690` comparison as the top-level shell paint baseline and restore the cheaper pan/zoom shell behavior on top of current code where it does not conflict with already-accepted lower-level flattening work.

Scope:

- treat this as a selective rollback/reintroduction task, not a broad conceptual cleanup
- compare the current shared shell files directly against `bf6487690`
- restore the old top-level shell behavior first in the shared shell seam:
  - `frontend/src/components/Section/Container/sectionChrome.ts`
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
  - any directly-coupled shell tests needed to preserve parity
- treat `frontend/src/components/Section/Container/SectionContainerCore.tsx` as a separate optional sub-step for the old gesture-time compositor-promotion behavior, not as part of the default shell-layout rollback
- compare current shell behavior against `bf6487690`
- reintroduce the paint-friendlier top-level shell contract selectively
- for Tier 1 dense param families, explicitly restore the old grid-style top-level shell behavior
- keep the accepted lower-seam simplifications that are unrelated to the shell paint regression
- do not broaden the rollback into section-owned body files unless a sparse-section restore task explicitly calls for it

Acceptance criteria:

- fresh `settings` traces show a clear `Paint` reduction versus current `HEAD`
- no visual regressions on section shell sizing and interaction affordances
- Tier 1 sections are back on the intended top-level grid-style shell before deeper body work continues

Current execution note:

- the first selective rollback checkpoint should restore the shared shell through:
  - `frontend/src/components/Section/Container/sectionChrome.ts`
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
- it should not automatically revive the old gesture-time compositor-promotion path in:
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- success condition for keeping that checkpoint:
  - `settings` shows a material paint reduction
  - the shell stays visually intact
  - if dense Tier 1 scenes still remain far above untouched `main`, move on to body/render-mode work instead of iterating on shell-only changes

## Phase 1A: Restore Local Body Layouts For Sparse Sections

After the shared top-level shell baseline is restored, selectively restore richer local body layouts for sparse section types where the branch-specific flattening work is not buying meaningful multiplicative performance.

Initial likely candidates:

- `Browser`
- `Draw`
- `Chart`
- `Prompt` surrounding layout
- `TextBlock` surrounding layout

Rules:

- restore locally in the section-owned body files
- do not reopen a shared heavy body contract used by Tier 1 or Tier 2
- prefer simpler flex/absolute recreation over reintroducing `subgrid`
- for `Prompt` and `TextBlock`, keep any CodeMirror/editor-path decisions deferred to Tier 2

Acceptance criteria:

- sparse sections regain the desired local layout quality
- Tier 1 and Tier 2 traces do not regress because of shared-contract fallout

Current execution note:

- the first sparse local-restore checkpoint has landed in:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx`
  - `frontend/src/components/Section/Layouts/ChartArea/ChartArea.tsx`
- those restores are intentionally targeted toward the `bf6487690` local body layout model without reopening shared `subgrid`
- `frontend/src/components/Section/Layouts/PromptArea.tsx` and `frontend/src/components/Section/Layouts/TextBlock.tsx` do not currently need an extra rollback step because their surrounding layout already matches the older baseline closely enough for this phase
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` and `frontend/src/components/Section/Container/SectionWindowSurface.tsx` should not be rolled back toward `bf6487690` because they now carry the shared body-host seam needed for the later render-mode work
- while keeping that seam, the canvas caller should still preserve the old placeholder-before-minimize ordering for externally window-bound sections
- sparse local restores should continue only when they are truly local to the owning section body and can be verified not to reopen Tier 1 or Tier 2 shared hot-path costs

## Phase 2: Add Section-Body Render-Mode Infrastructure

Build the explicit render-mode system without changing final appearance yet.

Scope:

- add render-mode state per section body
- wire deterministic mode inputs:
  - active state
  - hover/focus state
  - `viewportInteractionActive`
  - zoom
  - projected on-screen size
- add warm-pool bookkeeping
- keep everything functionally live at first while wiring the system

Acceptance criteria:

- render-mode transitions are observable and testable
- no motion-time preview generation exists

Current execution note:

- the first render-mode infrastructure checkpoint has landed through:
  - `frontend/src/components/Section/Container/SectionBodyGate.tsx`
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionBody.tsx`
- the current body-host seam already centralizes:
  - section-family classification
  - canvas versus window ownership
  - minimized and externalized-window skip behavior
- the next Phase 2 checkpoint should derive `auto` mode from live viewport state, not persisted project viewport state:
  - `viewportInteractionActive` from the live `useReactFlow` store
  - current zoom from `useReactFlow(...transform[2])`
  - measured section size from node internals
- this phase remains intentionally functionally live until a preview substrate exists:
  - `preview` and `warm` are now meaningful requested modes
  - the current seam still resolves only to live or skip behavior
- the paired rerun after landing the seam and sparse restores regressed versus the shell-only checkpoint, so the next slice must change real body cost or real render-mode behavior instead of adding more scaffolding alone

## Phase 3: Implement A Faithful Section-Body Preview Path

Replace inactive body participation in the motion path with a section-body-level preview representation.

Rules:

- preview generation on idle only
- visible preview swap allowed during motion
- no widget-level canvas explosion

Acceptance criteria:

- `settings` pan and zoom traces move into the refresh-limited band on the representative dev machine
- no visible blur during motion
- preview visuals remain faithful enough to preserve spatial recognition

Phase targeting note:

- start this phase on Tier 1 dense param sections first
- only widen into Tier 2 code sections after the Tier 1 path is proven
- do not force sparse restored sections onto preview mode unless profiling proves they need it

Current execution note:

- the first actual preview-capable path now exists only for top-level canvas Tier 1 bodies through:
  - `frontend/src/components/Section/Container/SectionBodyGate.tsx`
  - `frontend/src/components/Section/Container/sectionBodyModePolicy.ts`
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionPreview.tsx`
- current constraints:
  - preview is motion-time only
  - only Tier 1 dense-param families are preview-eligible
  - windows stay live
  - Tier 2 code sections stay live for now
- the first standardized rerun after landing that path produced only marginal and mixed gains, so the next preview iteration must be more aggressive or more accurate:
  - better projected-size / pane-visibility gating
  - lighter preview content or wider preview eligibility within Tier 1
  - possibly a different preview substrate if lightweight DOM is still too paint-heavy
- the first stronger preview iteration was benchmarked and rejected:
  - more aggressive motion-time Tier 1 preview gating plus an SVG-based substrate helped `settings` modestly
  - but it regressed the canonical `tier1Synthetic` aggregate benchmark
  - keep the earlier narrower preview checkpoint at `HEAD` and treat the stronger variant as an append-only dead end
- the first pane-aware offscreen-skip iteration was benchmarked and rejected too:
  - resolving fully offscreen inactive Tier 1 bodies to `skip` during motion helped `settings` modestly
  - but it regressed the canonical `tier1Synthetic` aggregate benchmark even more clearly
  - do not keep that visibility-only shortcut at `HEAD`
  - the next Tier 1 slice should either reduce live body cost directly or change the preview/warm representation in a way that helps both canonical scenes
- the first accepted post-preview slice is now live-body cost reduction, not broader preview gating:
  - row-level layout containment in `frontend/index.css` materially improved the canonical `tier1Synthetic` scene and improved the worktree-only `settings` confirmation rerun
  - keep this containment at `HEAD`
  - continue looking for deeper live row/body-cost reductions before widening preview policy again

## Phase 4: Eliminate Click-Wait Through Warm Activation

Use the render-mode system to make the common interaction path effectively immediate.

Scope:

- active section always live
- hovered section warm
- nearby likely-next sections warm
- first click on a previewed section must both activate and begin interaction

Primary hotspot to revisit during this phase:

- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`

Acceptance criteria:

- no second click required
- warm activation is effectively immediate
- cold activation is bounded and clearly smaller than the previously measured `~130ms` average preview hydration path

## Phase 5: Continue Flattening The Active Body DOM

Even with LOD, the active live section path still matters for:

- close zoom
- editing
- cold activation
- warm-pool memory budget

Continue reducing:

- wrapper count
- nested clipping/rounding surfaces
- recursive row complexity
- unnecessary local scroll/paint owners
- shallow module seams that force the reader to bounce across too many tiny files for one concept
- AI-hostile ownership splits where a single concept is spread across too many thin modules

Tier targeting:

- Tier 1 dense param sections are the main body-flattening target
- Tier 2 code sections should get their own focused pass after Tier 1
- sparse restored sections should only be revisited if they show up in traces

Deprioritize:

- icon-only cleanup
- small decorative tweaks that do not materially remove paint or DOM work

Acceptance criteria:

- active-section interactivity remains responsive
- DOM and paint cost fall further on active-body traces
- touched ownership seams become easier to reason about and test at a boundary level instead of through fragile cross-module coupling

Current execution note:

- the first retained live-body reduction after the narrow preview rollout is row-level layout containment in:
  - `frontend/index.css`
- this checkpoint is now part of the accepted Tier 1 baseline because:
  - the canonical `tier1Synthetic` scene improved strongly on the paired rerun
  - the worktree-only `settings` confirmation rerun improved enough to treat the first noisier `settings` paired sample as non-blocking variance instead of a true regression
- the next retained Tier 1 simplification removes nested-row guide chrome while keeping indentation:
  - `frontend/src/components/Params/paramRowClassNames.ts`
  - `frontend/index.css`
  - this intentionally drops the thin nested guide cue for dense param rows
  - the paired rerun improved `settings`
  - the confirmation rerun improved both `settings` and `tier1Synthetic`
- the next text-input underline simplification was benchmarked and rejected:
  - replacing the dense text-input wrapper pseudo underline with a direct border helped `settings`
  - but it did not hold up on the canonical `tier1Synthetic` confirmation rerun
  - keep the retained nested-guide-removal baseline instead of carrying that change at `HEAD`
- the next DummyCodeMirror preview-flattening experiment was also benchmarked and rejected:
  - flattening inactive `DummyCodeMirror` previews removed all sampled `.cm-line` wrappers on the live `settings` page while keeping the same text and near-identical sample geometry
  - the first paired rerun improved `tier1Synthetic`
  - but the same-code `settings` confirmation rerun regressed aggregate `Paint` and `RunTask`
  - keep the retained nested-guide-removal baseline instead of carrying that change at `HEAD`
- the next dense-row radius-removal experiment was also benchmarked and rejected:
  - removing `rounded-sm` from the shared dense row shell and selected-row background regressed both canonical scenes strongly on the first paired rerun
  - no same-code confirmation rerun was justified because the first paired matrix was already clearly worse in both `settings` and `tier1Synthetic`
  - keep the retained nested-guide-removal baseline instead of carrying that change at `HEAD`
- the next leaf-row shell-collapse experiment was also benchmarked and rejected:
  - collapsing the repeated name/value shell into the `TextInputCodeMirror` roots did remove the targeted wrappers on the live worktree pages
  - but the first paired rerun regressed both canonical scenes strongly enough that no same-code confirmation rerun was justified
  - keep the retained nested-guide-removal baseline instead of carrying that change at `HEAD`
- the next dummy-preview-language simplification experiment was also benchmarked and rejected:
  - removing inactive syntax highlighting from dense Tier 1 name/text previews did remove the sampled name-preview span wrapper on `benchmark-tier1`
  - but it barely touched the real `settings` hotspot rows and still regressed both canonical scenes strongly on the first paired rerun
  - keep the retained nested-guide-removal baseline instead of carrying that change at `HEAD`
- the next text-family plain-preview experiment was also benchmarked and rejected:
  - replacing inactive `CodeParam` / `TextParam` / `TextAreaParam` previews with a direct plain-text root did remove the targeted `.cm-line` path on both canonical worktree scenes
  - but it still regressed both canonical scenes strongly on aggregate `Paint` and `RunTask`, plus every representative slow pan/zoom phase in the first paired rerun
  - keep the retained nested-guide-removal baseline instead of carrying that change at `HEAD`
- the next row paint-containment experiment was also benchmarked and rejected:
  - broadening the accepted row containment from `contain: layout` to `contain: layout paint` on the same repeated Tier 1 row shells made both canonical scenes materially worse
  - `settings` and `tier1Synthetic` both regressed on aggregate `Paint`, `RunTask`, and `UpdateLayoutTree` in the first paired rerun
  - keep the accepted `layout` containment only and do not carry the `paint` containment change at `HEAD`
- the standardized `settings` harness now switches to the authoritative `All Settings` view before tracing:
  - `perf/fixtures/section-benchmarks/scene-manifest.json`
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/settingsTopLevelGridBenchmarkReplay.js`
  - the stable authoritative `settings` target is now `groupSectionDefault`
  - preserve older `Core`-view `/settings` traces only as diagnostics
- the next accepted Tier 1 row/body seam reduction is shared area-level column resize handles:
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamColumnResizeHandle.tsx`
  - authoritative worktree delta versus the same-harness retained baseline:
    - `settings` benchmark `Paint`:
      - `520.746ms -> 413.960ms`
    - `settings` benchmark `RunTask`:
      - `30027.733ms -> 27834.499ms`
    - `tier1Synthetic` benchmark `Paint`:
      - `918.136ms -> 747.929ms`
    - `tier1Synthetic` benchmark `RunTask`:
      - mixed:
        - `13776.586ms -> 14454.825ms`
      - but both slow overview-pan `Paint` phases still improved materially
  - live `All Settings` geometry check on the kept checkpoint:
    - `760` rows
    - `45` shared overlays
    - `274` nested rows
    - sampled nested seam alignment stayed within roughly `1.55px` of the input start, which is close enough to treat the earlier theoretical nested-alignment concern as non-blocking for this checkpoint
- the next Phase 5 slice should stay in this class of work:
  - deeper row/body DOM or paint reduction
  - simplified ownership around the shared param-row stack
  - avoid returning to broader preview-gating experiments unless they clearly help both canonical scenes
  - avoid spending another immediate cycle on isolated DummyCodeMirror wrapper flattening unless a larger shared Tier 1 body change makes that seam materially cheaper again
  - avoid spending another immediate cycle on isolated row-corner styling tweaks; the next candidate should hide or delete more real structure, ownership, or repeated body work than a single visual token change can reach
  - avoid another immediate attempt to push the full label/value shell ownership directly onto the CodeMirror roots; that specific collapse regressed both canonical scenes badly enough to reject as a local seam strategy
  - avoid another immediate dummy-preview-only syntax tweak unless it clearly reaches the real `settings` hotspot rows; the rejected preview-language pass mainly changed `benchmark-tier1` name rows and missed the heavier `settings` code-param path
  - avoid another immediate text-family inactive-preview simplification pass in `TextInputCodeMirror` / `DummyCodeMirror`; the broader plain-preview pass hit the intended value rows directly and still regressed both canonical scenes badly
  - avoid another immediate expansion of the accepted row-containment boundary; the `contain: layout paint` pass was decisively worse on both canonical scenes
  - current active structural target:
    - continue inside the repeated leaf-row/body seam now split across:
      - `frontend/src/components/Params/ParamContainer.tsx`
      - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
      - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
      - `frontend/src/components/Params/ParamUIs/TextParamInput.tsx`
      - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
      - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
    - current read:
      - bg/border/hover/selection ownership is still fragmented across those modules
      - every Tier 1 leaf row pays for that split
      - authoritative live `All Settings` counts after the shared-handle checkpoint narrow the next hotspot to the value-side path, not the name-label path:
        - `760` row shells
        - `682` `.section-value` nodes
        - `468` dummy CodeMirror value inputs
        - `0` active name editors
      - the next worthwhile experiment should remove or hide more of that repeated structure than the rejected isolated style-token passes could reach
      - the accepted shared-overlay handle checkpoint reduces one repeated row affordance already, so the next slice should try to compound that kind of win on other always-mounted dense-row surfaces
      - but it should do so without moving the full row shell responsibility onto `TextInputCodeMirror` itself
      - and it should hit the row families that still dominate `settings`, especially non-preview repeated value/body surfaces instead of another immediate inactive-preview-only tweak or another `contain` retune on the same row shell

## Phase 6: Reevaluate Tier 2 Code Sections

Run dedicated code-section profiling and then apply the same high-level framework with code-specific decisions.

Scope:

- benchmark representative code-section canvases
- benchmark representative `Prompt` and `TextBlock` editor states separately from their restored surrounding layout
- measure pan/zoom, activation, and editing latency
- decide whether code sections need:
  - body preview at low zoom and during motion
  - further editor-path simplification
  - a code-specific warm strategy
- decide whether any `Prompt` / `TextBlock` editor-path issues uncovered here belong to:
  - the same CodeMirror motion/activation bucket
  - or a later dedicated typing/editing-performance plan

Important constraint:

- do not couple this phase to terminal-section work

Acceptance criteria:

- code sections have a documented profile and an explicit optimization path
- no terminal work is pulled in by accident

## Phase 7: Reevaluate Engine Work Only After The Above

Only revisit an engine-level replacement if the hybrid body strategy still fails the target after the shell and LOD work.

If that phase is reached, evaluate only renderers with a genuinely different rendering model:

- canvas-first
- WebGL-first
- hybrid DOM/canvas

Do not spend time on a DOM-to-DOM engine swap unless new evidence shows the viewport container itself is the dominant bottleneck.

## Verification Requirements

Every implementation phase must include:

- fresh DevTools traces on `settings`
- before/after paint totals
- horizontal pan, vertical pan, full zoom, and detail zoom coverage
- visual validation that no temporary blur was introduced
- interaction validation that first-click activation still works
- direct untouched-`main` versus worktree pixel-level comparison on every touched section/layout seam that changes visible UI

At minimum, every meaningful performance checkpoint in this plan must run the standardized `settings` benchmark against:

- untouched `main`
- the current worktree branch

For the `settings` benchmark specifically:

- the authoritative run must switch both untouched `main` and the worktree to the `All Settings` view before the benchmark window starts
- `/settings` runs that stay on the default `Core` view are diagnostic-only and must not be treated as the acceptance benchmark for this plan

As the benchmark suite grows, meaningful checkpoints must also run the standardized synthetic benchmark scenes that correspond to the active tier scope of the work.

Prefer using the existing replay and trace-summary helpers:

- `perf/scripts/sectionBenchmarkScenes.js`
- `perf/scripts/sectionPanZoomBenchmarkReplay.js`
- `perf/scripts/settingsTopLevelGridBenchmarkReplay.js`
- `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`

Record new evidence under `perf/` as append-only reports.

Comparison rule:

- keep using exact untouched-`main` versus worktree visual compares as a hard gate
- when a visible layout seam is touched, do not rely on approximate screenshots or verbal inspection alone
- use centered DevTools element reads, screenshots, and geometry comparisons to confirm pixel-level parity or an explicitly accepted intentional difference

## Standardized `settings` CDP Benchmark

This plan should use one standardized CDP-only benchmark harness every time rather than ad hoc replay snippets.

Current base harness:

- `perf/fixtures/section-benchmarks/scene-manifest.json`
- `perf/scripts/sectionBenchmarkScenes.js`
- `perf/scripts/sectionPanZoomBenchmarkReplay.js`
- `perf/scripts/runSectionBenchmarkViaCdp.js`
- `perf/scripts/settingsTopLevelGridBenchmarkReplay.js`
- `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- `perf/scripts/installSectionBenchmarkScene.py`

If the current replay helper is missing any required coverage below, extend it rather than creating parallel one-off scripts.

Compatibility rule:

- keep `perf/scripts/settingsTopLevelGridBenchmarkReplay.js` as the settings-specific compatibility entry point
- move shared replay logic into the generic section benchmark scripts instead of forking more settings-only helpers

Settings-view rule:

- the standardized `settings` harness must switch to the `All Settings` view on both untouched `main` and the worktree before tracing
- the view switch should be part of the repeatable CDP automation path, not a manual precondition
- any earlier `Core`-view `/settings` traces should be preserved only as historical diagnostics, not as the authoritative baseline for future accept/reject decisions

Required benchmark coverage:

- zoom from the fit/overview minimum into the close/detail maximum
- zoom back out from close/detail to fit/overview
- horizontal pan across the full project width at minimum/overview zoom
- vertical pan across the full project height at minimum/overview zoom
- horizontal pan and vertical pan at a closer zoom level as a contrast case
- both slow and fast variants for the pan and zoom sweeps

The intent is to make the benchmark representative of both:

- overview navigation where many small sections are visible at once
- closer navigation where fewer but larger sections are visible

Standardization rules:

- use the same replay script for untouched `main` and the worktree
- use the same marked phases every run
- use the same target project shape every run
- prefer the `settings` project as the mandatory baseline comparison scene unless an additional scene is explicitly being added
- do not treat a one-off custom replay as authoritative evidence for the plan

Required CDP metrics collection:

- always collect a DevTools Performance trace for the standardized replay
- always summarize the trace with the shared summary script
- record at least these phase metrics:
  - `Paint`
  - `UpdateLayoutTree`
  - `Layout`
  - `RunTask`
  - `Commit`
  - `FireAnimationFrame`

Required benchmark deliverables for each accepted checkpoint:

- trace artifact for `main`
- trace artifact for the worktree
- summarized per-phase metrics for both
- written interpretation of the deltas

If the replay helper needs to evolve, keep backward-compatible mark names or update the summary helper in the same change so the benchmark remains one coherent standard.

## Standardized Benchmark Scene Suite

`settings` is the mandatory real-project baseline, but it should not be the only scene.

This plan should standardize a small reproducible benchmark-scene suite that can be loaded on both untouched `main` and the current worktree.

Required reproducibility rule:

- benchmark scenes must not depend on ad hoc local `setta_files`
- each scene should come from checked-in version-controlled fixture data or a deterministic checked-in builder script
- the same canonical scene definition must be loadable on both untouched `main` and the worktree branch

Required scene progression:

1. `settings`
   - mandatory real-project baseline
2. Tier 1 synthetic scene
   - contains the active Tier 1 section families in representative counts and arrangements
3. Tier 2 synthetic scene
   - added once Tier 2 work is active
   - contains representative Tier 2 code/editor section families
4. Tier 1 + Tier 2 combined synthetic scene
   - added once both tiers have dedicated scenes
   - used to validate mixed-canvas behavior

Tier 1 synthetic-scene requirements:

- include all active Tier 1 section families
- use representative repeated counts rather than a single instance of each type
- preserve deterministic section IDs, positions, and sizes across runs

Tier 2 synthetic-scene requirements:

- include the relevant code/editor families
- separate editor-heavy paths from surrounding restored layout where needed
- preserve deterministic section IDs, positions, and sizes across runs

Combined-scene requirements:

- place Tier 1 and Tier 2 sections on the same canvas
- preserve deterministic section IDs, positions, and sizes across runs
- use it to catch regressions that only appear when the heavy families coexist

Standardization rule for all synthetic scenes:

- use the same CDP replay script shape and the same trace-summary pathway as the `settings` scene
- if scene-specific fit or focal-point logic is needed, extend the shared replay harness instead of creating a separate ad hoc measurement flow
- keep the benchmark scripts, scene fixtures, and scene-building logic in version control
- materialize checked-in scenes through a deterministic installer path instead of relying on whichever runtime state already happens to be present

Current ready scene materialization path:

- the current ready canonical scene fixtures are:
  - `settings`
  - `tier1Synthetic`
- `settings` is a checked-in `setta-settings-project.json` style snapshot installed via:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root <target-state-root>`
- this makes the `settings` benchmark reproducible without depending on ad hoc local edits to `setta_files_dev`

Tier 1 readiness update:

- `tier1Synthetic` is now also a ready canonical scene fixture
- it is a checked-in `project.json` style single-config snapshot installed via:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root <target-state-root>`
- it can be regenerated through the checked-in builder:
  - `source activate.sh && python perf/scripts/buildSectionBenchmarkScene.py tier1Synthetic --output perf/fixtures/section-benchmarks/tier1-synthetic.project.json`
- the current canonical Tier 1 composition is:
  - 8 `Callable` sections
  - 12 top-level `Dict` sections
  - 1 `GlobalVariables` section
  - 4 `ListRoot` sections with 5 `Dict` children each
- 25 top-level sections and 45 total sections overall
- this keeps Tier 1 reproducible without depending on ad hoc local project edits, live settings-project state, or per-run scene authoring
- important live-run caveat:
  - direct fixture install into a running dev instance's `project.json` root does not guarantee the new project route is immediately available
  - for `project.json` style scenes such as `tier1Synthetic`, the paired CDP benchmark flow should restart or explicitly rehydrate the target backend after install before treating the route as benchmark-ready
- settings-scene targeting note:
  - the `/settings` route starts in the `Core` view mode, but the authoritative benchmark for this plan must switch to `All Settings` first
  - after the harness switches view modes, target a stable visible section in the `All Settings` canvas rather than a `Core`-only fallback such as `backendArgs`
  - do not accept `Core`-view `/settings` traces as the benchmark of record once the `All Settings` automation path exists

Current expectation for future synthetic scenes:

- Tier 1 / Tier 2 synthetic scenes should prefer checked-in full-project fixtures or deterministic builders over one-off runtime saves
- if the fixture path uses `project.json` semantics instead of the special `settings` route seam, keep the canonical scene definition authoritative and deterministic

Required checkpoint coverage by phase:

- before Tier 2 starts:
  - `settings`
  - Tier 1 synthetic scene
- once Tier 2 starts:
  - `settings`
  - Tier 1 synthetic scene
  - Tier 2 synthetic scene
  - Tier 1 + Tier 2 combined synthetic scene

## Initial Acceptance Targets

The final thresholds may tighten after baseline reruns, but the initial target shape is:

- `settings` pan and zoom should return to the display-refresh-limited band on the representative dev machine
- `Paint` during pan and zoom should collapse dramatically from current `HEAD`
- no visible temporary blur during motion
- no second-click interaction requirement
- active section remains fully interactive during motion

## Primary Code Clusters

Likely implementation centers:

- shell / viewport behavior:
  - `frontend/src/forks/xyflow/core/container/Viewport.tsx`
  - `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `frontend/src/components/Section/Container/sectionChrome.ts`
- body ownership:
  - `frontend/src/components/Section/Container/SectionAreaSwitch.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.tsx`
  - `frontend/src/components/Section/Layouts/CallableArea.tsx`
  - `frontend/src/components/Section/Layouts/GlobalVariablesArea.tsx`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- sparse section local-restore candidates:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx`
  - `frontend/src/components/Section/Layouts/ChartArea/ChartArea.tsx`
  - `frontend/src/components/Section/Layouts/PromptArea.tsx`
  - `frontend/src/components/Section/Layouts/TextBlock.tsx`
- text/code preview path:
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
  - `frontend/src/components/Section/Layouts/CodeArea.tsx`
  - `frontend/src/components/Section/Layouts/PromptArea.tsx`
  - `frontend/src/components/Section/Layouts/TextBlock.tsx`

## Cross-Cutting Refactor Rule

While doing the performance work, also use the touched seams to improve code cleanliness and AI navigability where the cleanup has clear local payoff.

That means:

- prefer deeper modules over spreading one concept across many shallow files
- consolidate tightly-coupled render-mode and body-ownership logic when it improves clarity
- remove incidental indirection that exists only because the old structure grew by accretion
- keep cleanup subordinate to the performance goal, but do not miss obvious chances to make the code easier to navigate and reason about

## Open Questions To Answer Inside The Plan, Not Ad Hoc

- What exact screen-space threshold should gate preview eligibility?
- Should the preview be raster, SVG, semantic lightweight DOM, or a mix by section type?
- How large should the warm pool be?
- Should warm sections remain mounted under the preview or swap fully visible/live on hover?
- Which section types need custom preview handling, and which can share one body-preview system?
- Which sparse section bodies should actually be restored locally versus left on the leaner branch model?
- Which code-section optimizations are worthwhile once Tier 1 is stable?
- Which `Prompt` / `TextBlock` issues are true pan/zoom-motion problems versus separate typing/editing-performance problems?

These questions should be answered with traces and direct visual verification, not by intuition alone.
