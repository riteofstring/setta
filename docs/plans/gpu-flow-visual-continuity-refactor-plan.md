# GPU Flow Visual Continuity Refactor Plan

## Goal
Make retained GPU Flow content visually continuous under cold cache, fast pan, resize, and first-open settings scenarios. A section shell must not be visible for more than a frame or two while its deterministic passive content is blank.

This is a larger refactor plan. It deliberately does not preserve the old retained page publication semantics, add compatibility shims, or keep a transitional dual path.

## Problem Statement
The latest Chrome recording shows that the retained coverage refactor removed some redundant work, but it did not make visual publication atomic.

Baseline recording:
`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260515-234334`

Observed failure:
- `sectionSizingPolicy`, `shortcuts`, and other sections show card chrome while row contents remain blank for more than one second.
- Retained display diagnostics in the recording show max true-hole area of about `5,381,066` CSS px.
- The recording shows a true-hole window above `1,000,000` CSS px lasting about `1343ms`; aggregate analysis across the full recording shows true-hole area above `100,000` CSS px for about `17,076ms`.
- A text-like row snapshot sample around frame `1740` showed `401` passive text-like rows, with `30` ready, `371` missing, and `368` blank.
- In that frame, `shortcuts` had `49` blank passive rows out of `62`, and `sectionSizingPolicy` had `48` blank passive rows out of `58`.
- The retained texture maintenance path had many visible descriptors queued while the default retained upload budget repaired roughly one page per frame after the blank frame was already published.

Root cause:
- The display path can publish visible "true holes" for deterministic passive content.
- Text-like passive rows often depend on async DOM snapshot readiness before their retained page can upload.
- Repair happens after submit, so the first visible frame is allowed to be blank and later frames catch up gradually.
- The scheduler treats cold visible repair too much like ordinary refinement work.

The more principled fix is to change the retained content contract from "publish holes, then repair" to "publish only committed visual epochs, with a deterministic readable base for passive content and exact snapshots as refinement."

## Design Principles
- Display frames consume committed visual epochs, not in-progress retained page descriptors.
- Deterministic passive content must have a readable base representation before it is exposed.
- Async DOM snapshots are an exactness upgrade, not the only way to draw visible passive text-like rows.
- Active controls remain real DOM islands. Passive controls are canvas/GPU content unless they are actively edited, focused, hovered where needed, or selected.
- Snapshot readiness is an explicit event in the pipeline, not a failed upload attempt that is retried during frame maintenance.
- Visible cold repair has its own priority and time budget. Background prefetch and exact-fidelity refinement cannot starve it.
- Scrolling, panning, and simple viewport motion use transforms, UVs, or uniforms. They do not require recapturing deterministic content every frame.
- Existing retained texture handles should be stable at the logical level; backing resources can swap only after a replacement is complete.
- Warm interaction performance is a first-class contract. Panning, zooming, and section scrolling in an All Settings-scale scene should target 120 fps-class responsiveness, with pass/fail gates normalized against the measured idle frame baseline on every environment.

## Preserve Existing Progress
The retained coverage planner, committed coverage store, transactional page lifecycle, motion-first frame work, and bounded rejected-coverage diagnostics are useful progress from the previous refactors. This plan should preserve those pieces unless the failing visual-continuity test proves a specific piece blocks readable first-visible passive content.

Do not restart the coverage compositor, committed coverage index, or motion pipeline as cleanup. The next implementation should change only the ownership boundary that still permits deterministic passive content to be published as visible blank true holes.

## Publication Invariant
The current architecture is sound in its ownership model. The missing contract is what may be displayed when different surfaces in the same section are ready at different times.

| Surface type | Owner | Capture/source | Committed visual unit | Interaction path | Stale-content policy | Visible blank allowed |
| --- | --- | --- | --- | --- | --- | --- |
| Section chrome | React/browser section DOM | DOM/html surface capture | section chrome generation | browser DOM where interactive, otherwise GPU composite | keep previous committed chrome or delay new group until body base is readable | no silent blank |
| Deterministic retained parameter rows | project retained row/control descriptors | retained descriptors, layout, theme, style tokens | readable base visual epoch over retained pages/tiles | retained hit records; active controls promote to DOM islands | keep compatible previous epoch or generate base from descriptors | never when authoritative descriptors exist |
| Snapshot-exact parameter rows | snapshot producer | hidden snapshot DOM or native element image | exact snapshot epoch generation | passive only; active controls use DOM islands | keep readable base visible until exact snapshot commits | no |
| Active DOM island | active control owner | live DOM control | active island transform and value generation | native browser input/focus/selection | keep passive base outside active island; commit value before returning passive | no silent blank |
| Unsupported or non-deterministic content | explicit diagnostic owner | none or unsupported capture | explicit unavailable diagnostic, not a blank hole | none unless promoted to active DOM | fail loudly without retry storms | no silent blank |

Parameter-owning sections have a cross-surface visual group. A section group's chrome and visible retained body base coverage must publish as a readable group. If the chrome for a new group is ready but the retained body base is not, keep the previous committed group or delay the new group. The accepted first-visible state is readable base content, not a card shell with blank deterministic rows.

## Ideas To Borrow From The Example Repos
The examples under `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` point toward a better model than the current "snapshot required before upload" flow.

### `html-in-canvas-cracks`
- Treat DOM as a texture source, but never expose an unpainted texture as the foreground content.
- Keep the logical texture object stable while forcing GPU reallocation only when the backing buffer size changes.
- Use an explicit first-paint readiness gate so the screen does not flash through uninitialized content.
- Use shader UVs and transforms for scroll and resize alignment instead of rebuilding all visual content on motion.
- Coalesce paint work through animation-frame scheduling.

### `compiz-web`
- Transitions sample both old and new page textures.
- The old committed visual state remains available until the new state is ready.
- Replacement is a visual transaction: new content is appended, painted, and only then composited into view.

### `three-html-render`
- Separate interaction from texture capture. DOM overlays can be positioned with `matrix3d` while raster content follows its own paint lifecycle.
- Prefer event-driven paint and interaction updates over per-frame polling.
- Keep a native fast path for element-to-texture capture, with a fallback path behind the same abstraction.

### `html-in-canvas-official`
- Treat the paint event as the snapshot boundary.
- Drawing outside a paint event uses the previous committed snapshot; before the first snapshot, the API fails instead of silently providing blank content.
- Element snapshots can be captured and transferred to worker/offscreen work.
- DOM transforms are synchronized separately from drawing so hit testing and accessibility stay aligned with the rendered surface.

## Proposed Architecture

### 1. Behavior Tests First
Add tests before changing the implementation. These tests must fail against the current code and must assert user-observable behavior, not internal queue or descriptor details.

Required tests:
- Add a Playwright or Chrome-recording based test for the cold Settings All Settings view.
- Drive the same kind of scenario from the recording: open settings, show multiple sections including `shortcuts` and `sectionSizingPolicy`, and capture frames after the section shell becomes visible.
- Assert that first-visible deterministic base content reaches a readable state no later than two animation frames after section chrome visibility, with same visual-group commit preferred.
- Assert that exact snapshot refinement reaches its own looser target, for example `250ms`, because it is a fidelity upgrade rather than the readability gate.
- Assert that no large visible deterministic blank-content region persists longer than the two-frame base-readability threshold. This should be based primarily on screenshots, sampled pixels, canvas output, or existing recording state summaries that represent visible output.
- DOM or accessibility-visible text may support the diagnosis, but it must not be the sole passing oracle because source DOM can contain text while the WebGPU canvas remains blank.
- Define "readable" without OCR: for known row label/value rectangles, assert non-background foreground coverage, text-like pixel density, contrast against the row background, and absence of large blank deterministic regions. Renderer diagnostics may identify the visible row rectangles, but the passing oracle must include visible canvas/screenshot pixels.
- Assert frame cadence during recovery, for example p95 frame interval below `32ms` and no repair-induced long task above `50ms` in the measured window.
- Avoid assertions on `maxUploads`, `targetDescriptorCount`, retained page keys, texture page queue length, or snapshot readiness internals.

Also add focused frontend tests that model the public behavior of the retained renderer:
- A cold visible section with many passive text-like rows publishes readable row labels and values in the first displayed visual epoch.
- Motion of an already committed visual epoch remains smooth while exact snapshots or higher-fidelity pages are prepared.
- An exact snapshot can replace the base epoch atomically without a blank intermediate frame.
- Common-row base-to-exact replacement stays visually bounded: no blank intermediate frame and no unacceptable visual jump for row labels, scalar values, switches, checkboxes, dropdown display text, numeric values, or readonly/disabled text.

The first implementation PR for this plan should contain only these failing tests and a baseline report under `perf/`.
The baseline report must include the recording path above, the max true-hole area, the max continuous true-hole windows for the chosen thresholds, and the frame `1740` passive row readiness sample.

Regression rule:
- Do not begin the architecture change until at least one realistic behavior-level test reproduces the blank-section issue and fails on the current implementation.
- Do not accept implementation work based only on narrow new tests. Each implementation slice must run the full GPU Flow-related test suite before it is considered done.
- A passing result from the new repro test is necessary but not sufficient. The existing GPU Flow behavior suite is the guard against regressions in panning, resize, active DOM islands, retained controls, hit testing, texture scheduling, frame generation, and project-surface integration.

### 2. High-Refresh Performance Tests
Add realistic interaction performance tests before relying on the refactor for user-facing performance claims.

Required scene:
- Use the real Settings project's All Settings page when practical.
- If the real project fixture is too expensive or brittle for CI, add a generated fixture that matches the All Settings page's observed complexity: many sections, dense parameter rows, mixed control types, nested section content, scrollable section bodies, and enough visible/offscreen content to exercise retained coverage, active DOM island boundaries, and texture replacement.
- Do not use a tiny synthetic graph as the primary performance proof. Existing large graph fixtures are useful supporting coverage, but this plan needs an All Settings-like content fixture.

Required interactions:
- Panning across a large complex scene at multiple zoom levels.
- Zooming in and out around dense section clusters.
- Scrolling section contents inside large sections.
- Repeating the same interactions in both warm-cache and cold-cache states. The warm-cache run measures steady interaction performance; the cold-cache run verifies that repair/refinement work does not cause visible stalls.

Performance target:
- Each test must first measure an idle/requestAnimationFrame baseline for the current browser and machine. Apply baseline normalization everywhere, including 120 Hz-capable local runs.
- The 120 fps-class target is p95 frame interval at or below `8.33ms`, p99 no worse than one missed 120 Hz frame, and no long task above `50ms` during panning, zooming, or section scrolling.
- The non-flaky pass gate should be baseline-normalized, for example p95 interaction frame interval no worse than `max(8.33ms, idleP95 * 1.15)` and p99 no worse than one missed measured baseline frame.
- If 120 fps proves impossible for a specific environment, the perf report must say why with measurements. The fallback target should still be in the same range: no sustained interaction below the measured display refresh class, no repeated multi-frame gaps, and no repair-induced long tasks.
- Track input-to-render latency when possible, not just raw frame cadence.

Required assertions:
- The tests assert observed performance behavior: frame intervals, dropped-frame windows, long tasks, input-to-render latency, and visible blank-content windows.
- The tests do not assert implementation details such as upload counts, queue lengths, descriptor counts, or internal scheduler names.
- Any performance threshold change must update the baseline report under `perf/` with the hardware, browser version, refresh-rate baseline, test scene size, and before/after numbers.

Likely implementation hooks:
- Extend `frontend/tests/e2e/gpuFlowPerformanceProbe.ts` if needed to compute p95/p99 intervals and input-to-render latency.
- Add a Playwright spec under `frontend/tests/e2e/gpu-flow/` for the All Settings-like performance scenario.
- Reuse `gpuFlowLargeGraphStressFixture` only as supplemental stress coverage, not as a replacement for the settings-shaped fixture.

### 3. First Implementation Slice Boundary
After the failing tests and baseline report exist, the first implementation slice should be deliberately narrow:

- Add a deterministic base visual epoch for visible passive text-like rows in the Settings All Settings scenario.
- Draw readable row labels and scalar values from existing retained scene/control descriptors and existing style tokens.
- Treat exact DOM snapshots as later fidelity refinement, not as the first-visible readability gate.
- Add parameter-owning section visual-group readiness so DOM chrome and visible retained body base coverage do not publish as desynchronized visible states.
- Do not rewrite the retained coverage planner, committed coverage store, motion pipeline, or full scheduler unless the failing behavior test proves one of them directly blocks the first slice.
- Do not implement the full common-control renderer, stable handle model, or event-driven snapshot producer in the first slice unless they are needed to make deterministic text-like rows readable without frame-cadence regression.

The first slice is complete only when the cold Settings repro no longer shows a large deterministic text-like blank window and the existing GPU Flow behavior suite still passes.

### 4. Introduce Retained Visual Epochs
Replace direct display publication of retained page descriptors with an explicit visual epoch model.

Conceptual states:
- `base`: deterministic canvas/GPU rendering of passive content from scene/control descriptors.
- `snapshot-exact`: DOM-captured or native element-captured rendering for higher fidelity.
- `active-dom`: real DOM island for focused or actively edited controls.

A display frame may sample only committed epochs. It may not sample unready snapshot pages or publish a blank true hole for deterministic passive content.

Start with page/tile-level epochs wrapped around the existing retained page machinery. Whole-section or new surface resources are later options, not a prerequisite for the first slice.

```ts
type RetainedVisualEpochKind = "base" | "snapshot-exact" | "active-dom";

type RetainedVisualEpoch = {
  readonly surfaceId: string;
  readonly generation: number;
  readonly kind: RetainedVisualEpochKind;
  readonly zoomBucket: number;
  readonly dpr: number;
  readonly styleKey: string;
  readonly layoutVersion: number;
  readonly contentVersion: string;
  readonly committedCoverage: readonly Rect[];
  readonly pages: readonly RetainedPageHandle[];
};
```

The important first change is the publication rule: display samples committed readable epoch coverage, not in-progress descriptors.

True-hole categories must be explicit:
- Deterministic passive content: must not publish as a visible blank first-visible state.
- Active DOM island content: owned by a real DOM island while active; it is not passive epoch coverage.
- Unsupported or non-deterministic content: must fail loudly or publish an explicit non-readable fallback diagnostic, and it does not satisfy deterministic passive-content acceptance criteria.

Deliverables:
- Add a `RetainedVisualEpoch` model owned by the GPU Flow retained content layer.
- Make each visible region resolve to a committed epoch before publication.
- Keep old epoch resources alive until the replacement epoch is complete and committed.
- Delete the old behavior that treats blank true holes as an acceptable visible output for deterministic passive rows.

### 5. Add A Deterministic Passive Text Renderer
Build a canvas/GPU passive renderer for text-like rows and common settings controls.

This renderer should draw from authoritative frontend scene/control descriptors:
- section labels
- row labels
- scalar text values
- disabled/readonly input text
- checkboxes, switches, dropdown display text, numeric values, and empty states
- selected/focused passive visual states when the control is not an active DOM island

This is not meant to recreate arbitrary HTML. It is the base visual contract for deterministic controls that already have structured descriptors. Exact DOM snapshots can still refine typography, caret details, rich text, or browser-native form rendering after they are ready.

For simple deterministic rows, the base renderer should be the long-term canonical passive renderer rather than merely a temporary fallback. Snapshot-exact should be reserved for cases where browser-native rendering, complex text fidelity, or active-control fidelity materially matters.

The renderer must use existing retained row/control descriptors, geometry, theme, typography, and style-token inputs. Do not introduce a parallel inventory of row kinds, control kinds, aliases, or local type mirrors. If a needed field is missing, export it from the existing owner surface rather than duplicating it.

Deliverables:
- A renderer abstraction that turns passive row descriptors into readable pixels without waiting for DOM snapshot readiness.
- Typography and color inputs wired to the existing style tokens used by the settings UI.
- Coverage for large section bodies, not only headers and chrome.

### 6. Make Snapshot Capture Event-Driven
Replace snapshot readiness polling during upload attempts with an explicit snapshot producer.

The snapshot producer should:
- subscribe to source invalidations, layout changes, paint readiness, and active/passive transitions
- coalesce work per animation frame
- produce a committed snapshot generation keyed by source identity and visual inputs
- notify the retained texture store when a snapshot generation is ready
- fail loudly for unsupported or impossible capture states instead of silently publishing blank pages
- fail without retry storms: after bounded attempts, a missing paint record or unsupported capture state becomes `snapshot unavailable for generation X` while readable base content remains visible

Native or future HTML-in-Canvas style APIs should sit behind this producer:
- `drawElementImage`
- `texElementImage2D`
- `copyElementImageToTexture`
- fallback raster capture where currently required

Snapshot generation keys must include at least:
- source identity
- content version
- layout version
- style/theme token version
- font readiness or font version
- DPR
- zoom bucket
- active/passive control state
- scroll offset or clipped window
- relevant value, error, focus, hover, disabled, readonly, validation, and search-highlight state

The retained display path should not know which capture mechanism produced the snapshot. It should only know whether a committed snapshot epoch exists.

### 7. Split Visible Repair From Background Refinement
Replace the single small post-submit maintenance loop with two explicit queues.

Visible repair queue:
- first-visible, user-observable, highest priority
- area and distance weighted
- allowed to consume an adaptive time or byte budget until the visual continuity target is met
- never blocked by background prefetch or exact snapshot refinement

Refinement queue:
- exact DOM snapshot replacement
- offscreen prefetch
- lower-resolution to higher-resolution upgrades
- stale-but-readable epoch replacement

The scheduler should optimize for observed frame cadence, not a fixed upload count. A fixed count such as "one upload per frame" is the wrong unit because page area, byte size, and user-visible urgency vary.
This step is later architecture work. It must not substitute for the first-slice requirement that deterministic passive rows have a readable base before they are exposed.

### 8. Add Atomic Texture Commit And Stable Logical Handles
Keep logical texture handles stable across resize, DPR changes, and replacement epochs.

Implementation rules:
- Allocate or resize backing resources off the display path.
- Upload all pages required for a replacement epoch before committing it to display.
- Atomically swap the committed backing generation when complete.
- Retain the previous committed generation until no display frame can reference it.
- Dispose old GPU resources after the frame fence or equivalent lifecycle point.

This borrows the useful part of the examples' texture lifecycle: stable material references with controlled backing reallocation.

### 9. Clarify Active DOM Island Ownership
Make active controls independent from passive snapshot capture.

Rules:
- Passive controls are rendered by the retained visual epoch.
- The currently active editor/control becomes a DOM island positioned with a transform that matches the canvas draw location.
- When the active control deactivates, it commits data back to the scene/control model first.
- The passive base epoch can render the committed value immediately.
- Exact snapshots may refine later, but cannot block the readable base.

This avoids keeping a large live DOM just to make passive content visible, while preserving native behavior for editing and focus.

### 10. Delete The Old True-Hole Publication Path
Once epochs, base rendering, event-driven snapshots, and atomic commits are in place, remove the old publication model.

Deletion targets:
- display-time replacement descriptors that can point at unready blank retained pages
- upload retry loops that use snapshot unready state as ordinary scheduler backpressure
- any rule that marks deterministic passive content as publishable while visually blank
- transitional compatibility aliases or dual-read paths

The retained page machinery may still exist as an implementation detail inside an epoch, but display publication should no longer reason in raw page descriptors.

### 11. Observability And Guardrails
Keep logs and metrics focused on the user-observable contract.

Add or preserve metrics for:
- time from section shell visible to deterministic content readable
- section visual-group ready/committed latency
- largest visible blank deterministic content area
- consecutive blank frames
- p95 and p99 frame interval during visible repair
- p95 and p99 frame interval during warm panning, zooming, and section scrolling
- dropped-frame windows relative to measured idle refresh baseline
- input-to-render latency for pointer wheel, drag, and zoom interactions where measurable
- repair work time per frame
- exact snapshot replacement latency
- base-to-exact visual delta for common deterministic rows
- active DOM island count

Avoid making internal queue length the main success metric. It is useful for debugging, but the contract is visual continuity and frame cadence.

## Execution Order
1. Add the cold Settings repro and baseline report. Include the known true-hole area/window and passive row-readiness samples.
2. Add the public-behavior retained renderer test: many passive text-like rows, no snapshot readiness, first displayed epoch must be readable.
3. Add base text/value drawing inside the retained page raster path using existing retained descriptors and style tokens.
4. Change display publication so deterministic retained rows cannot emit blank true-hole coverage when base coverage can be generated from descriptors.
5. Add section visual-group readiness for parameter-owning sections so chrome and retained body do not visibly desynchronize.
6. Add snapshot-exact as an atomic refinement over the base epoch, with bounded visual delta for common deterministic rows.
7. Only after first-visible readability is fixed, split visible repair/refinement queues and delete the old true-hole publication path.

## Verification Plan
- First PR: add failing behavior-level tests and append the current baseline to `perf/`.
- First PR baseline report: include the baseline recording path, max true-hole area, continuous true-hole windows for the chosen thresholds, frame `1740` passive-row readiness, and per-surface blank counts for `shortcuts` and `sectionSizingPolicy`.
- First PR: add the All Settings-like high-refresh performance test harness and record current panning, zooming, and section-scrolling baseline under `perf/`, even if the initial thresholds are marked as expected failures during the architecture work.
- First implementation slice: prove visible passive text-like rows in the cold Settings scenario become readable within two animation frames or same visual-group commit without relying on DOM/accessibility text as the sole oracle.
- First implementation slice: prove parameter-owning section chrome and retained body base coverage publish as a readable visual group.
- Snapshot refinement verification: prove exact snapshot replacement occurs atomically, does not introduce a blank intermediate frame, and stays within the documented visual-delta bound for common deterministic rows.
- During implementation: run targeted Vitest coverage for retained renderer behavior.
- During implementation: run Playwright or Chrome-recording tests for the cold settings scenario.
- During implementation: run the All Settings-like performance scenario for warm-cache and cold-cache panning, zooming, and section scrolling.
- During every implementation slice: run the full GPU Flow-related Vitest suite, not only the newly added tests:
  - `pnpm -C frontend exec vitest run src/gpuFlow src/components/Pages/Project/GpuProjectSurface src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts src/components/Pages/Project/GpuProjectSurface.grid.test.ts src/forks/dnd-kit`
- During every implementation slice that can affect browser-visible behavior: run the full GPU Flow-related Playwright suite, not only the new repro:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow frontend/tests/e2e/gpuFlowPerformanceProbe.test.ts frontend/tests/e2e/gpuFlowVisualParityProbe.test.ts frontend/tests/e2e/gpuFlowInteractionLatencyProbe.test.ts`
  - Also run every existing E2E spec that renders or manipulates GPU Flow. Discover that set with `rg -l 'setta-gpu-flow|gpuFlow' frontend/tests/e2e | rg '(\.spec|\.test)\.ts$'` and pass those files to `./scripts/run-playwright-e2e.sh`, or run the complete E2E suite if that is simpler.
- After implementation: create a new Chrome recording of the original repro and compare:
  - blank deterministic content window
  - largest blank area
  - frame cadence during repair
  - frame cadence during panning, zooming, and section scrolling
  - exact snapshot replacement latency
- Run `pnpm -C frontend exec vitest run <targeted tests>` for frontend unit coverage.
- Run `./scripts/run-playwright-e2e.sh` for affected browser flows.
- Run `./scripts/quality/check.sh` before completion unless the implementation scope is explicitly narrowed.
- Perform CDP visual verification for the settings page.

## Acceptance Criteria
First-slice acceptance criteria:
- The new cold Settings behavior-level test fails on the current implementation and passes after the first implementation slice.
- `shortcuts`, `sectionSizingPolicy`, and similarly visible deterministic text-like rows show readable labels and scalar values within two animation frames after their shells are visible, with same visual-group commit preferred.
- Parameter-owning section chrome and retained row body publish as a readable group for the visible region.
- No visible deterministic text-like blank region above the agreed area threshold persists longer than two animation frames in the cold Settings repro.
- The first slice does not rewrite the retained coverage planner, committed coverage store, motion pipeline, or full scheduler unless the perf report identifies a direct blocker.
- The passive base renderer consumes existing retained scene/control descriptors and existing style-token inputs, with no parallel control-kind inventory or local type mirror.
- Exact DOM snapshot readiness is not required for first-visible passive text-like row readability.

Full refactor acceptance criteria:
- The initial tests fail on the current implementation and pass after the refactor.
- The full GPU Flow-related Vitest suite passes.
- The full GPU Flow-related Playwright suite passes, including the new observed-behavior repro and existing specs discovered by GPU Flow selectors/imports.
- The All Settings-like performance tests pass for panning, zooming, and section scrolling.
- Warm panning, zooming, and section scrolling meet the baseline-normalized performance gate on every environment: p95 frame interval no worse than `max(8.33ms, idleP95 * 1.15)`, p99 no worse than one missed measured baseline frame, and no long task above `50ms`.
- On 120 Hz-capable hardware, the perf report also records whether the stricter 120 fps-class target was met: p95 frame interval at or below `8.33ms` and p99 no worse than one missed 120 Hz frame.
- `shortcuts`, `sectionSizingPolicy`, and similarly large cold sections show readable deterministic base content within two animation frames after their shells are visible, with same visual-group commit preferred.
- Parameter-owning section chrome and visible retained row body publish as a readable visual group; the accepted visible state is never a card shell with blank deterministic retained rows.
- No deterministic passive section publishes a visible true hole as its normal first-visible state.
- Hidden DOM snapshot readiness cannot block base passive row readability.
- Exact DOM snapshots can replace base content without a blank intermediate frame.
- Exact DOM snapshot replacement for common deterministic rows stays within the accepted visual-delta bound.
- Visible repair maintains the agreed frame cadence target, for example p95 frame interval below `32ms` in the measured recovery window.
- A new Chrome recording no longer shows one-second blank section bodies or large true-hole windows during the Settings All Settings repro.
- Old page-descriptor display publication is removed rather than kept behind a compatibility switch.
- No backward compatibility, transitional adapters, dual paths, or legacy shims are added.

## Non-Goals
- Do not add skeleton loading placeholders as the long-term fix.
- Do not preserve the old blank-hole publication behavior.
- Do not keep all passive controls as live visible DOM.
- Do not replace the whole settings data model.
- Do not rewrite the retained coverage planner, committed coverage store, or motion pipeline solely as cleanup.
- Do not hand-roll a browser-grade rich text or form renderer for arbitrary HTML. The base renderer covers deterministic structured controls; exact snapshots cover higher-fidelity cases.

## Risks
- Canvas text and control rendering must match the UI closely enough to avoid a visible jump when exact snapshots arrive.
- The base renderer adds a new owner for passive visual fidelity, so style token integration needs to be deliberate.
- Atomic epoch commits may temporarily increase GPU memory during replacement.
- Active DOM island alignment bugs would be user-visible, so transform math needs dedicated visual tests.

## Open Decisions
- Choose the final area and density thresholds for the pixel-based "readable" oracle before implementing the tests. The timing target is two animation frames or same visual-group commit for deterministic base readability; `250ms` is reserved for exact snapshot refinement.
- Choose the exact high-refresh performance gates after the first baseline run. The target is 120 fps-class behavior on capable hardware, with pass/fail normalized against measured idle baseline everywhere; any lower threshold must be justified by measured browser/hardware limits, not implementation convenience.
- Decide which settings/control kinds are deterministic enough for the base renderer in the first implementation slice.
- Decide whether exact snapshot capture should run on the main thread initially or move to worker/offscreen capture as part of the first refactor.
- Decide whether to represent base epochs as one surface per section, one surface per viewport tile, or a hybrid based on section size and scroll behavior.
