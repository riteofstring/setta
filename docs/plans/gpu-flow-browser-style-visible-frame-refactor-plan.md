# GPU Flow Browser-Style Visible Frame Refactor Plan

Date: 2026-05-23

## Problem Statement

The current coherent visible-frame implementation does not behave as one
coherent visible-frame implementation. The latest Chrome recording shows that
motion projection, retained content, browser visual actors, section chrome,
public runtime state, and presentation diagnostics can still advance, hold, or
abort at different times.

Symptoms observed in the latest recording:

- section headers and section chrome disappear or never appear;
- retained section scroll offsets are recorded, but the visible section does not
  reliably move;
- content flickers, flashes, disappears, and reappears during normal use;
- whole sections fail to render;
- pan and zoom produce visible long frames and poor responsiveness.

The recording also shows that this is not primarily an input routing failure.
Wheel input and retained section scroll flushes are observed. The failure is at
the publication and scheduling boundary: the system can keep projecting motion
while content and browser-owned visual debt remain unresolved, and the retained
coverage proof can report zero true holes while user-visible actor families are
missing or blocked.

This plan replaces the current cutover with a larger refactor. The target is a
browser-style frame pipeline: source trees, immutable snapshots, prepared
resources, eligibility proof, and exactly one visible presentation step.

## Source Material

- Visual correctness reference:
  `go-rewrite` branch, which is the DOM-only implementation. Use it as the
  product-level reference for section structure, headers, row layout, control
  placement, clipping, scrolling behavior, active control semantics, and overall
  Settings visual correctness.
- Latest broken Chrome recording:
  `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260523-220744`
- Architecture iteration history:
  `docs/notes/gpu-flow-architecture-iterations.md`
- Current architecture reference:
  `docs/reference/html-in-canvas-architecture.md`
- Example repos reviewed:
  `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official`
  `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev`
  `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render`

## Constraints

- Keep the GPU Flow direction. Do not return to XYFlow or a DOM graph renderer.
- Keep retained parameter content descriptor-owned and page-rasterized.
- Keep browser-owned semantics for text-like values, active editors, native
  controls, focus, selection, IME, accessibility, and native hit testing.
- Do not reintroduce whole-section DOM overlays as the normal visible path.
- Do not add backward compatibility shims, dual-read/write paths, transitional
  adapters, legacy aliases, or silent fallback behavior.
- If rollback is used for product stabilization, make it a hard branch-level
  rollback while this refactor proceeds separately. Do not ship both
  publication systems in one runtime.

## Execution And Branch Policy

Do not treat this plan as the next incremental hardening pass on current HEAD.
Current HEAD is useful as a failure, test, and diagnostic base. It is not the
production base for another stack of guards around the current
visible-frame kernel/scheduler/presenter split.

Use two branch roles when stabilization matters:

1. **Stabilization branch**
   - Use the observed-behavior tests from this plan to identify the last usable
     GPU Flow commit.
   - The likely search window is after the browser visual actor runtime became
     useful and before the Iteration 21 visible publication authority cutover,
     but tests decide the rollback point.
   - If this branch is shared, prefer creating a new stabilization branch or an
     explicit revert strategy over rewriting shared history.
   - Do not add a runtime flag or compatibility switch between old and new
     visible-frame systems.

2. **Refactor branch**
   - Carry the golden evidence, failing observed-behavior tests, and temporary
     manifest diagnostics.
   - Use current HEAD only long enough to prove the failure and identify missing
     actor families.
   - Delete or replace the current publication split as production authority.
   - Implement the new coordinator around required actor families, resource
     debt, eligibility proof, and `PresentedFrame`.

Do not half-revert and half-refactor in one runtime. That creates the same dual
authority problem this plan is meant to remove.

## Correct App State Contract

The refactor is not complete just because a frame engine invariant holds.
Settings is the benchmark surface for this refactor, not a special-case product
target. It is valuable because it exercises the hard generic GPU Flow cases at
once: nested sections, retained content, browser-owned controls, active editors,
native controls, clipping, retained section scroll, pan, zoom, portals, and high
DOM/control density.

The target is generic GPU Flow behavior that matches the DOM-only product
semantics users rely on. A future implementation session should treat this
section as the normative definition of "correct" for any GPU Flow scene with
the same actor families unless a developer explicitly changes the product
design.

### Benchmark Surface: All Settings

When `/settings` is opened and `All Settings` is selected:

- the GPU Flow pane fills the available workspace and shows the map grid behind
  settings sections;
- visible sections render as stable map surfaces with section shell, header,
  body clip, retained parameter rows, and controls all aligned to one viewport
  transform;
- each visible section has a readable header/title band. The header band is
  part of the section chrome, not part of the scrollable retained row content;
- section bodies are clipped to their section bounds. Overflowing parameter rows
  scroll inside the section body rather than leaking into neighboring sections;
- retained rows show label text, row chrome, focus/hover state when applicable,
  and value/control pixels in the expected row slots;
- browser-owned text-like values are visible as real browser-rendered pixels and
  align with the retained row chrome;
- active editors, native controls, comboboxes, tooltips, validation UI, and DOM
  islands appear at the same projected position as the canvas/retained content
  that owns their anchor;
- no whole visible section, header band, retained body, or visible value/control
  region may be blank after settle.

### Retained Section Scroll

When the pointer is over a retained settings section body and the section can
scroll:

- wheel input scrolls the section body content;
- the section header and outer chrome remain visible and stationary relative to
  the section surface;
- row labels, row chrome, browser-owned values, and scrollbars move coherently
  with the body content;
- no frame during the scroll may replace the section body with a blank,
  placeholder, stale unrelated section, or mixed-generation actor set;
- the final settled pixels must visibly differ from the pre-scroll body pixels
  in the scrolled region.

### Pan And Zoom

When the user pans or zooms the settings map:

- the whole presented map projection moves as one composed frame;
- section shell/header/chrome, retained pages, browser-owned values, active DOM,
  overlays, hit state, and public viewport state use the same presentation
  matrix;
- browser-owned DOM actors do not lag, jump, duplicate, or disappear relative
  to their retained row slots;
- retained section scroll offsets are preserved through viewport motion;
- panning and zooming do not trigger visible content blanking or long repair
  work on the hot motion path.

### Interaction Semantics

Browser-owned controls remain real browser controls:

- focused text-like controls keep caret, selection, keyboard input, IME, and
  accessibility behavior;
- native controls such as date, password, file/dropzone, and color inputs use
  real DOM/native behavior when active;
- only the intended active browser-owned actor is interactively exposed for a
  given control. Passive snapshots and retained canvas row chrome must not
  create duplicate effective interaction targets;
- hit testing follows the visible presentation, not stale source DOM geometry.

### Performance Envelope

The correct state includes responsiveness:

- standard-refresh interactions should avoid frame gaps over 50 ms;
- no long task over 50 ms should occur during the measured pan, zoom, and
  retained-scroll interaction windows;
- high-refresh displays should use a p95 frame-interval budget relative to the
  measured baseline cadence;
- repair/refinement work may continue after interaction, but it must not blank
  visible actors or starve motion.

### Establishing Golden Evidence

The first implementation step should create a durable golden target before
refactoring:

1. Create a disposable worktree for the `go-rewrite` branch and capture the
   DOM-only Settings reference. This is the primary visual correctness target
   for user-facing layout and interaction behavior.
2. Capture a golden bundle from `go-rewrite`:
   - screenshots for All Settings after settle;
   - screenshots during retained section scroll at around 60 ms, 120 ms, and
     after settle;
   - screenshots during combined pan, zoom, and retained scroll;
   - frame cadence and long-task summaries;
   - section/header/body clip rectangles used for screenshot assertions.
3. If a GPU Flow commit before the visible publication authority cutover is also
   useful, capture it as secondary evidence. Use it to understand intended
   GPU-specific motion behavior, not to override the DOM-only product
   correctness target.
4. Use disposable worktrees for all branch/commit comparisons. Do not mutate
   this repo's current git history or use a non-disposable developer worktree
   for test state.
5. Store the golden evidence as append-only perf/report artifacts or Playwright
   fixtures, not as ad hoc local screenshots.
6. New tests should compare against this target with region-aware tolerances,
   not full-page pixel perfection. Text rasterization and small antialiasing
   differences are acceptable; missing headers, blank bodies, drift, duplicate
   controls, and disappearing values are not.

GPU Flow may differ from `go-rewrite` in renderer internals, texture sampling,
minor antialiasing, and canvas-specific effects. It may not differ in whether
sections, headers, row labels, row chrome, values, controls, clipping, scrolling,
focus, active editor behavior, or accessibility exposure are correct. If a
visual difference from `go-rewrite` is intentional, document the product reason
near the golden evidence before implementing the refactor.

## Step 1: Add Failing Observed-Behavior Tests

Before changing implementation, add tests that fail on the current branch and
capture the user-visible regression. These tests must assert observed behavior,
not internal implementation details. Internal app-state events may be attached
as diagnostics, but pass/fail must come from pixels, interaction response, frame
cadence, long-task budget, and absence of visible blank/flicker states.

Settings should be used as the first benchmark because it is dense and already
exposes the failure. The implementation must not add Settings-specific rendering
paths, actor rules, scheduler exceptions, or layout heuristics. Any fix must
apply through generic GPU Flow actor families, resource states, preparation
queues, presentation rules, and motion projection rules.

Add a new Playwright spec, for example:

```text
frontend/tests/e2e/settings/settings-retained-visible-frame-observed-failure.spec.ts
```

The spec should cover this exact failure shape:

1. **All Settings first-render integrity**
   - Open `/settings`.
   - Select `All Settings`.
   - Wait for the settings surface to settle.
   - Capture a screenshot of the canvas viewport.
   - Assert known user-facing section header bands have visible ink and are not
     blank/background-only.
   - Assert retained content regions have nonblank ratios above a fixed floor.
   - Assert no whole visible section region is blank after settle.

2. **Retained section scroll actually moves visible pixels**
   - Target a known retained settings section with enough rows to scroll.
   - Capture a before screenshot of the section content clip.
   - Dispatch native wheel events over that section.
   - Capture screenshots around 60 ms, 120 ms, and after settle.
   - Assert the visible pixels change in the expected section clip.
   - Assert the header/chrome band remains visible during and after scroll.
   - Assert there is no blank/placeholder band in any sampled frame.

3. **Pan and zoom maintain cadence while content remains visible**
   - Use native CDP wheel/pinch events matching the latest recording shape:
     several normal wheel bursts, then ctrl-wheel zoom bursts, then retained
     section scrolls.
   - Run a requestAnimationFrame heartbeat and a long-animation-frame or
     PerformanceObserver probe during the interaction.
   - Assert max frame gap is at most 50 ms on standard-refresh displays.
   - Assert no long task exceeds 50 ms.
   - On high-refresh displays, assert p95 frame interval is bounded relative to
     measured baseline cadence.
   - Assert screenshots sampled throughout the interaction keep section header,
     row chrome, and browser-owned value pixels visible.

4. **Flicker and disappearance guard**
   - Sample a short screenshot sequence across consecutive animation frames
     while panning, zooming, and retained-scrolling.
   - For stable header/chrome/content regions, assert nonblank ratio never drops
     below the settled baseline floor.
   - Assert frame-to-frame deltas do not oscillate between content-present and
     content-absent states.

5. **Latest Chrome recording reproduction parity**
   - Add a scriptable interaction sequence that mirrors the latest manual
     recording closely enough to reproduce the failure without depending on the
     old recording artifact.
   - Attach screenshots, performance snapshots, long-task details, and app-state
     diagnostics to the Playwright output.
   - The initial expected result for this step is failure on current HEAD.

These tests should not assert names such as `visibleFrameKernel`,
`held-previous-budget-exceeded`, or `snapshot-pending`. Those details are useful
diagnostics, but the regression is that users see missing content and bad frame
cadence.

Every failing test should attach a compact diagnostic payload alongside
screenshots and performance data:

```text
{
  presentationId,
  requiredActorsByFamily,
  readyActorsByFamily,
  compatibleActorsByFamily,
  missingActorsByFamily,
  blockedDebt,
  scrollHorizonCoverage,
  visibleOutcome
}
```

The payload explains failures. It is not the pass/fail oracle.

## Ideas To Borrow From The Example Repos

The useful ideas are architectural, not direct implementation copies.

1. **Direct child containment from `layoutsubtree`**
   - The official HTML-in-canvas model only promotes direct canvas children.
   - Each child is paint-contained, has predictable clipping, and remains the
     accessibility and hit-testing source.
   - GPU Flow should mirror this with explicit top-level visible actor hosts:
     section shell/header actors, retained content actors, browser-control
     actors, DOM island actors, overlay actors, and native visual actors.

2. **Separate draw transform from DOM synchronization transform**
   - `drawElementImage()` draws with the canvas transform and returns the CSS
     transform needed to keep DOM hit testing aligned.
   - GPU Flow should compute canvas draw transforms and DOM projection
     transforms from the same immutable presentation matrix. CSS transform
     writes are synchronization, not content publication.

3. **Paint is once per frame, after DOM paint, with no looping**
   - The official design deliberately avoids looping paint events.
   - DOM writes made during a paint callback affect the next frame, not the
     current frame.
   - GPU Flow should adopt the same rule: preparation work can request a future
     frame, but cannot mutate the frame currently being presented.

4. **Snapshots are resources**
   - `captureElementImage()` and the three.js `HTMLTexture` fallback treat
     captured element pixels as explicit resources with source identity.
   - Browser visual hosts, retained text-like snapshots, retained pages, and
     DOM islands should all be modeled as resources with ownership, readiness,
     lifetime, and release rules.

5. **Native browser interaction is kept by projecting real DOM**
   - `three-html-render` uses one matrix per frame to keep real HTML elements
     positioned for browser event dispatch.
   - GPU Flow should keep this principle for text-like controls and active DOM,
     but projection must be driven by the same presentation frame as the canvas.

6. **Smoke tests must include pixels and errors**
   - The example test helpers assert canvas nonblank pixels and no console/page
     errors.
   - GPU Flow needs stronger versions of this: region-specific visible ink,
     frame cadence, long-task limits, and no blank/flicker sequences.

## Target Architecture

Replace the current visible-frame cutover with a smaller but stricter pipeline:

```text
Input Sample
  -> Frame Request
  -> Prepared Resources
  -> Candidate Frame
  -> Eligible Frame
  -> Presented Frame
```

Avoid the overloaded word "committed" for any stage that is not visible. In
this plan, only `PresentedFrame` mutates visible state. Everything before that
is preparation, proof, resource debt, or diagnostics.

### One Reducer Rule

There is exactly one reducer that decides visible outcome. Every other module
only produces facts.

```text
sample = sampleInputAndRuntime()
manifest = deriveRequiredVisibleActorManifest(scene, sample)
resources = prepareOrLookupResources(manifest, budgets)
candidate = buildCandidateFrame(manifest, resources, sample)
decision = reduceVisibleFrame(candidate, previousPresentedFrame)
present(decision)
```

The reducer owns the decision to present, project, hold, block, abort, or queue
repair. Renderers, retained page managers, browser visual runtimes, DOM island
layers, debug stores, and resource registries may prepare facts and resources,
but they must not independently decide visible outcome.

### Complete Presentation Manifest

The central data structure is the required visible actor manifest. It is not a
diagnostic add-on; it is the definition of a complete presentation.

Each visible clipped scene region should resolve required actor facts like:

```text
{
  actorId,
  family,
  required,
  desiredRect,
  clipChain,
  zOrder,
  contentGeneration,
  projectionGeneration,
  resourceState,
  acceptableCoverage,
  readinessProof,
  lastPresentedCompatibleResource
}
```

A frame is presentable only if every required actor family is exact, compatible
by a family-specific proof, or explicitly absent for a scene-level reason.
Missing section chrome or missing header actors are hard blockers, not
diagnostics.

### Actor Families

Every user-visible surface must belong to a required actor family:

- `scene-background`;
- `grid`;
- `edges`;
- `section-shell`;
- `section-header`;
- `section-body-clip`;
- `retained-page`;
- `retained-native-visual`;
- `browser-text-control`;
- `browser-text-snapshot`;
- `active-editor`;
- `dom-island`;
- `viewport-portal`;
- `hit-generation`;
- `accessibility-exposure`;
- `debug-snapshot`;
- `public-runtime-state`.

Section shell/header/chrome actors are part of the initial manifest design.
They are generic scene structure, not Settings-specific behavior and not a
later patch on top of retained content.

### Resource States

Resources should use explicit states:

```text
absent -> requested -> preparing -> ready -> presented -> retired
```

Blocked states such as "awaiting live host", "awaiting snapshot", "awaiting
retained page", and "awaiting upload budget" are not publication outcomes.
They are resource debt states with owners, deadlines, and wakeup signals.
Enforce this separation in types: readiness states describe resource debt;
visible-frame outcomes describe reducer decisions.

### Compatibility Proofs

Compatibility is family-specific and narrow:

- section shell/header/chrome compatibility requires matching scene geometry,
  style generation, clip, z-order, and presentation matrix;
- retained page compatibility requires compatible content generation, page
  coverage, scroll/projection horizon, and clip chain;
- browser text control compatibility requires matching semantic value
  generation, visual rect, clip, and active/passive representation;
- active editors are usually exact-live only; compatible previous coverage
  should be rare and explicit;
- DOM islands are exact-live or explicitly surviving the same presentation
  transaction;
- hit testing is compatible only if it maps to the same presented frame.

### Motion Rule

Motion is allowed to be fast only because it is simple.

A motion frame may:

- sample input;
- update the live viewport or retained scroll projection;
- transform already-presented resources;
- submit one canvas projection using already-presented resources;
- project browser-owned DOM actors from the same presented frame.

A motion frame may not:

- publish new content;
- mutate visible browser hosts independently;
- upload non-repair textures;
- release candidate resources;
- change public semantic state;
- present lower-coverage content as success.

If motion discovers that the current presented frame cannot cover the requested
projection, the coordinator either holds the previous complete presentation or
schedules resource repair with explicit priority. It must not present partial
actor families or let motion starve repair indefinitely.

Retained section scroll needs stronger preconditions than viewport pan and
zoom. The coordinator should maintain projection-horizon coverage for retained
scroll before or during early scroll:

- retained pages cover visible and near-future scroll exposure;
- browser text actors or snapshots cover the same scroll horizon;
- section header/chrome is proven stationary relative to the section surface;
- scrollbar and retained-native visuals are exact or generated independently;
- missing horizon coverage schedules visible repair under reserved budget even
  while interaction is active.

If the scroll delta exposes uncovered rows, holding the previous presentation is
correct but must be treated as continuity debt with an aging budget, not as a
healthy projected frame.

### Preparation Rule

Heavy work happens in preparation lanes, not in the hot motion lane:

- retained page rasterization;
- browser visual host preparation;
- text-like snapshot capture;
- DOM island preparation;
- texture uploads;
- section shell/header resource generation;
- React semantic snapshot calculation;
- debug/hit generation.

Preparation lanes produce immutable candidate resources. They do not make
anything visible until `Present` consumes them.

### Presentation Rule

`Present` is the only visible mutation point.

One presentation token must atomically apply:

- canvas submission;
- retained page draw set;
- section shell/header/chrome draw set;
- browser control projection;
- DOM island projection;
- viewport portal projection;
- hit-testing generation;
- debug snapshot;
- public runtime state;
- React semantic notification;
- resource retirement.

Held, blocked, aborted, and preparing frames do not mutate visible state. They
may record diagnostics and schedule future work.

### Budget Rule

The scheduler needs a budget broker instead of ad hoc deferral:

- reserve a small deterministic rAF budget for motion projection;
- reserve bounded per-frame preparation budget even during active gestures;
- prioritize visible actor debt over refinement debt;
- make debt age visible and fail loudly when it crosses budget;
- never use "interaction active" as a reason to suppress all content/browser
  repair work.

Debt priority should be explicit:

1. Safety debt: missing required visible actors, missing active editor, visible
   true-hole retained page, missing section shell/header/chrome.
2. Continuity debt: compatible previous exists but is aging, scroll horizon is
   thin, browser snapshot is stale but still semantically compatible.
3. Quality debt: resolution upgrades, lower-LOD replacement, offscreen prefetch,
   passive refinement.

Motion may preempt quality debt. It must not indefinitely starve safety or
continuity debt.

## Refactor Phases

### Phase 1: Failing Observed-Behavior Tests

Implement the tests described in Step 1 and commit them while failing on the
current implementation. Save the failure screenshots and performance summaries
under the Playwright output artifacts. This becomes the regression target for
the refactor.

### Phase 2: Temporary Actor Manifest Diagnostics

Before deleting the current authority, add temporary diagnostic-only evidence
that exposes the actor family manifest the new coordinator must cover. This is
not a fix and should not become a second publication system.

The dump should report, per sampled frame:

- presentation id or current visible frame id;
- required actor counts by family;
- ready, compatible, missing, and blocked counts by family;
- visible resource debt and debt age;
- scroll horizon coverage;
- blocker reasons with actor family and actor id.

Use this evidence to prove which required families are missing in the latest
bad recording and in the new failing tests. Then delete or replace this
temporary path as the new coordinator lands.

### Phase 3: Hard Stabilization Decision

Follow the Execution And Branch Policy before replacing the implementation.
Choose one of these based on the failing tests and product needs:

- continue on the current branch if the failing tests are enough to guide the
  refactor quickly;
- hard-roll the product branch back to the last usable GPU Flow commit before
  the visible publication authority cutover, then perform this refactor on a
  separate branch.

Do not add a runtime compatibility switch between the old and new visible-frame
publication systems. A rollback is a branch choice, not a product code path.

### Phase 4: Delete The Current Publication Split

Remove the current visible-frame kernel/scheduler/presenter split as the
production authority. The replacement should not preserve old module boundaries
where they encode the current failure:

- motion lane and content lane clearing debt independently;
- browser visual readiness as a passive blocker;
- retained coverage proofs that exclude section/header/chrome reality;
- held outcomes that can update some visible state while other actor families
  remain old;
- resource release paths that are not subordinate to presentation.

Focused unit tests for pure proof helpers may be retained only if their model
still matches the new actor/resource state machine. Otherwise delete them with
the old implementation.

### Phase 5: Build The New Frame Coordinator And Manifest

Introduce a single coordinator that owns:

- frame requests and coalescing;
- input samples;
- required visible actor manifest derivation;
- resource state graph;
- preparation queues;
- budget allocation;
- candidate creation;
- eligibility proof;
- presentation token issuance;
- visible mutation application;
- post-present resource retirement.

Suggested module shape:

```text
frontend/src/gpuFlow/GpuFlow/visibleFrameCoordinator.ts
frontend/src/gpuFlow/GpuFlow/visibleFrameStateMachine.ts
frontend/src/gpuFlow/GpuFlow/visibleFrameActorRegistry.ts
frontend/src/gpuFlow/GpuFlow/visibleFrameResourceGraph.ts
frontend/src/gpuFlow/GpuFlow/visibleFrameBudgetBroker.ts
frontend/src/gpuFlow/GpuFlow/visibleFramePresentation.ts
frontend/src/gpuFlow/GpuFlow/visibleActors/
```

This is a replacement, not a wrapper around the old authority.

Section shell/header/chrome must be first-class actor families from the first
manifest implementation. The current failure cannot be prevented if section
structure is merely implied by retained content or DOM source presence. This is
generic scene structure, not a Settings-specific concept.

Required section proof:

- every visible section has a shell/header actor or an explicit scene reason for
  not having one;
- actor geometry matches the sampled scene and viewport;
- actor ink is present in the screenshot oracle;
- actor clipping matches the retained content clip;
- actor transforms use the same presentation matrix as canvas and DOM actors.

### Phase 6: Rebuild Browser Visuals As Resource Debt

Browser visual actor states should move out of the passive-blocker model.

For each browser-owned actor, track:

- source host identity;
- desired presentation rect and clip;
- representation kind: live host, snapshot, active editor, native island;
- readiness state;
- last ready resource;
- candidate resource;
- debt age;
- wakeup source.

`snapshot-pending` and `live-dom-budget` should schedule concrete preparation
work and wake the coordinator when ready. They should not repeatedly produce
blocked publication outcomes while motion continues.

### Phase 7: Rebuild Retained Content Around Presentation Resources

Retained pages should remain descriptor-owned and page-rasterized, but their
publication should produce resources for the coordinator:

- exact page resources;
- compatible page resources;
- visible true-hole blockers;
- repair work requests;
- retired page resources after present.

Compatible lower-LOD coverage is allowed only when readability-critical actor
families are still proven present: headers, labels, browser-owned values, active
editors, and section chrome.

### Phase 8: Reconnect Motion Projection

After resources and actor families are explicit, reconnect pan, zoom, and
retained section scroll as projection over the last complete presentation.

The projection path should have one invariant:

```text
Projected frame = transform(previous complete presentation, current motion sample)
```

If that cannot be proven, the coordinator holds the previous complete
presentation and prioritizes repair. It does not project partial or
mixed-generation actor families.

### Phase 9: Reconnect Public State And Diagnostics

Public runtime stores, React semantic notifications, hit/debug snapshots, and
diagnostic attributes should update from presentation, not preparation.

Diagnostics should report:

- current presentation id;
- frame request reason;
- selected work lane;
- actor family readiness;
- visible resource debt age;
- skipped preparation due to budget;
- dropped or retired candidate resources;
- frame cadence and long-task measurements.

These diagnostics are for debugging and reports. The tests from Step 1 remain
observed-behavior tests.

### Phase 10: Verification And Removal

The refactor is done only when:

- the new observed-failure Playwright spec fails before the refactor and passes
  after it;
- existing retained settings visual, scroll, text-like, IME, active-editor, and
  user-recording regression specs pass;
- targeted visible-frame unit tests pass against the new state machine;
- `./scripts/quality/check.sh` passes for the working tree;
- a fresh Chrome recording of the manual failure flow shows no missing section
  headers, no disappearing sections, no blank text clips, no long tasks over
  budget, and no repeated held-over-budget publication loop;
- CDP visual verification confirms the Settings All Settings surface renders,
  scrolls, pans, and zooms without flicker.

Delete obsolete old visible-frame modules and tests after the new coordinator is
the only production authority. Do not leave unused compatibility modules behind.

## Success Criteria

- All Settings renders with visible section headers, section chrome, retained
  rows, and browser-owned values on first settle.
- The behavior that passes the All Settings benchmark is implemented through
  generic GPU Flow actor/resource/presentation paths, with no Settings-specific
  renderer or scheduler shortcuts.
- Retained section scroll changes visible pixels within 120 ms without blanking
  headers, row chrome, or values.
- Pan and zoom stay within frame cadence budgets and do not run long tasks over
  50 ms on standard-refresh displays.
- No whole visible section disappears during sampled interaction sequences.
- Motion projection cannot starve visible resource repair.
- Browser visual actor debt wakes the coordinator with concrete preparation
  work.
- Every visible mutation is attributable to one presentation id.
- The runtime has one visible-frame authority and no old compatibility path.

## Rollback Guidance

If stabilization is needed before this refactor lands, roll back to the last
commit that passes the retained Settings behavior and performance probes before
the visible publication authority cutover. The likely search boundary is around
the transition from the browser visual actor runtime finish line to the
Iteration 21 single visible publication authority work.

Use the new Step 1 tests to identify the rollback point. Do not guess based only
on commit messages, and do not roll back to XYFlow or whole-section DOM
overlays.
