# GPU Flow Retained Visual Epoch Refactor Plan

## Goal

Make GPU Flow settings sections visually atomic, stable, and responsive under cold cache, view switches, active text input, pan, zoom, resize, and section scrolling.

The retained renderer must not:

- show a section shell while deterministic passive row content is blank
- restyle passive settings inputs one second after first paint
- draw passive retained text underneath an active DOM text island
- wedge pan or zoom because a retained repair path cannot make progress
- publish uninitialized or partially initialized texture content

This is a larger refactor plan. It intentionally does not preserve the current publication semantics, compatibility paths, or dual-read/write behavior. The implementation should delete replaced paths as each new owner boundary lands.

## Current Failure

The latest recording showed a hard render-loop failure after switching from Core to All Settings:

`Retained deterministic visible base coverage did not make pre-publish repair progress`

The first failure reported:

- `holes=40->40`
- `area=5381066->5381066`
- `queued=0->0`
- `uploadable=0`
- `replacements=0`
- `rejectedReasons={"row-content-version-mismatch":9}`
- the visible target was `snapshot-exact`

After this, wheel and pointer input continued to enter the viewport runtime, but normal retained display frames stopped publishing. That explains why panning and zooming appeared dead after switching views.

The screenshots show two additional user-visible failures:

- Passive text-like controls initially draw with one style and then switch to a different retained/snapshot style after about one second.
- Clicking a text-like control draws an active DOM island while retained passive text remains visible underneath it.

These are ownership-contract failures, not just upload-budget failures.

The current pre-publish repair gate is now considered diagnostic evidence, not
the architecture to extend. The next implementation should replace direct
descriptor publication and render-path repair gating with visual ownership,
committed epochs, and atomic visual groups. Do not make this failure mode go
away by adding another retry loop around the same publication contract.

## Anti-Loop Guardrails

- Do not add another render-path retry or repair loop as the primary fix.
- Do not make `snapshot-exact` satisfy or block deterministic base readiness.
- Do not downgrade the render-loop failure into a silent fallback.
- Do not accept queue counts, upload counts, descriptor counts, or repair
  progress as proof of user-visible correctness.
- Do not keep old descriptor publication running in parallel after the
  replacement epoch path lands.
- Do not patch only the reported `row-content-version-mismatch` case unless the
  ownership contract also prevents the same class of blank, overlapping, or
  wedged visual state for other mismatch reasons.

## Source Of Truth

The retained content contract should be:

- Go and generated project data remain authoritative for settings values, row identity, and section structure.
- Frontend retained descriptors are the authoritative frontend input to passive rendering.
- Deterministic passive settings rows are rendered by the retained canvas/GPU renderer.
- Snapshot-exact DOM capture is a refinement for content that truly needs browser rendering fidelity.
- Active controls are real DOM islands and have exclusive ownership of their visual rect while active.

Do not add a parallel TypeScript settings schema, row inventory, or handwritten compatibility mirror. If a field is missing from the retained descriptors, export it from the existing owner path.

## Principles

- Display frames consume committed visual epochs, never in-progress descriptors.
- A deterministic passive row with authoritative descriptors must always have readable base pixels before it can be exposed.
- Snapshot-exact content is never the first-visible readability gate for deterministic settings rows.
- Active DOM islands own their control rect exclusively.
- Old committed visuals remain visible until replacement visuals are complete.
- View switches are visual transactions. A new settings surface group can be staged, but it cannot partially publish blank body content.
- Pan, zoom, and scroll use transforms, UVs, or uniforms against committed content. They do not require new raster capture before motion appears.
- Snapshot readiness is event-driven. It is not discovered by retrying failed uploads during the render path.
- Runtime rendering should fail loudly in diagnostics and tests, but an expected unready snapshot refinement must not throw every frame and wedge input.

## Ideas To Borrow From Example Repos

### `html-in-canvas-cracks`

Borrow:

- First-paint readiness gates. The example outputs a stable fallback until the first HTML texture is actually painted.
- Stable logical texture references. The JS texture object stays stable while backing GPU resources are forced to reallocate when dimensions change.
- Scroll and resize alignment via shader UVs and transforms, not recapturing content on every motion frame.
- Real DOM for input and selection, while the composited texture is what the user sees.
- Coalesced paint work through animation-frame scheduling.

Apply to Setta:

- A retained visual handle should remain stable while backing pages swap only after completion.
- A new base or snapshot epoch should commit atomically.
- Motion should keep sampling committed epochs while repair/refinement proceeds independently.

### `compiz-web`

Borrow:

- Navigation transitions sample both old and new page textures.
- The old visual remains usable while the new visual is prepared.
- Replacement is a transaction: capture, paint, then composite into view.

Apply to Setta:

- Core to All Settings should keep the previous committed settings view or an explicit staged state until the new All Settings base group is readable.
- A partial All Settings group with blank deterministic rows is not publishable.

### `three-html-render`

Borrow:

- Separate interaction from texture capture.
- DOM overlays are synchronized with `matrix3d` transforms, while texture capture follows its own paint lifecycle.
- Native HTML-in-Canvas APIs and fallback rasterization sit behind one abstraction.
- Interaction updates are event-driven where possible.

Apply to Setta:

- Active text-like controls should be DOM overlays synchronized from the retained frame, with exclusive visual ownership.
- Snapshot exactness should sit behind a snapshot producer interface, not behind ad hoc upload attempts.

### `html-in-canvas-official`

Borrow:

- The `paint` event is the snapshot boundary.
- Drawing outside a paint event uses the previous committed snapshot; before the first snapshot, the API fails instead of silently returning blank content.
- `captureElementImage` allows transferable snapshots for worker/offscreen work.
- `drawElementImage` returns transforms for DOM/canvas synchronization.

Apply to Setta:

- Snapshot-exact epochs should be produced by explicit paint events.
- If no initial snapshot exists, keep base content visible and record `snapshot unavailable`, rather than publishing blank pixels or throwing in the frame loop.
- DOM island geometry should be synchronized as part of the visual transaction.

## Step 1: Add Failing Behavior Tests First

The first PR for this plan must add failing tests and a baseline report only. These tests must use observed behavior: screenshots, frame timing, input-to-render latency, visible movement, long tasks, console/page errors, and stable visual output. They must not assert queue counts, descriptor counts, internal replacement reasons, upload budgets, retained page keys, or scheduler names.

Regression prevention depends on two requirements:

- The new tests must be realistic and user-observable. They should fail only when the user would see blank content, visual instability, overlapping owners, stalled motion, frame-rate collapse, long tasks, unhandled errors, or uninitialized texture publication.
- Every implementation slice after the failing-test slice must run the full GPU Flow-related test suite, not only the new focused repro tests. A focused repro passing is necessary but not sufficient.

Add a baseline report under `perf/` that records:

- latest recording path
- browser version and display refresh baseline
- machine/display notes
- screenshots or frame captures for the three reported failures
- first page-error timestamp and message
- p95/p99 frame interval during the failed All Settings switch
- whether pan/zoom produced visible movement after the switch

### Required E2E Repro Tests

Add tests under `frontend/tests/e2e/gpu-flow/`.

#### 1. Cold Settings Passive Input Stability

Scenario:

- Open the Settings project cold.
- Let the Core view show the same visible sections as the screenshots.
- Capture a screenshot as soon as the `shortcuts` section body is visibly readable.
- Capture another screenshot after at least 1500ms.

Assertions:

- Known row label/value regions remain visually stable within a tight pixel-diff threshold.
- Row separator and input/background styling do not change class of appearance after the delayed capture.
- The test samples actual page pixels or canvas pixels, not only DOM text.
- The test fails if a delayed snapshot-exact replacement changes the user-visible passive row style.

#### 2. Active Text-Like Control Has Exclusive Visual Ownership

Scenario:

- Open Settings Core.
- Scroll or position the `shortcuts` section so a text-like shortcut row is visible.
- Click the value/control cell to activate the native text island.
- Capture the active control crop.

Assertions:

- The crop contains one visible text rendering, not overlapping passive and active text.
- The active DOM island rect is aligned with the retained control rect within a small pixel tolerance.
- Text baseline and caret/selection pixels do not overlap a second retained value baseline underneath.
- The test may use screenshot pixel density, component counting, or bounded visual diff against a known active-control reference. It should not inspect retained draw-region arrays.

#### 3. Core To All Settings Does Not Wedge Motion

Scenario:

- Open Settings Core.
- Switch to All Settings.
- Immediately perform a wheel-pan sequence and a pointer-pan sequence.
- Capture frame timing and screenshots before and after motion.

Assertions:

- There are no unhandled page errors during the switch and motion window.
- RequestAnimationFrame p95 is no worse than `max(16.7ms, idleP95 * 1.25)` for the non-stress gate, with a stricter high-refresh perf gate below.
- At least one screenshot after each input sequence shows visible viewport movement matching the input direction.
- Input-to-visible-movement latency stays below 100ms for the functional test.
- The test fails if wheel/pointer events are consumed but the visible canvas does not move.

#### 4. All Settings First Visible Rows Are Readable

Scenario:

- Switch to All Settings cold.
- Capture frames from the first visible All Settings section shell through the next two animation frames and again at 250ms.

Assertions:

- Deterministic row label/value rectangles have foreground contrast and text-like pixel density by two animation frames after the section shell is visible.
- No large deterministic blank body region remains visible after that threshold.
- The 250ms capture may be stricter for refinement, but base readability is the pass gate.
- The oracle uses screenshot/canvas pixels plus known row rectangles. DOM text alone is not sufficient.

#### 5. No Uninitialized Texture Publication

Scenario:

- Run the same cold view-switch and active-control sequence.
- Collect browser console, page errors, and Chrome log output when available.

Assertions:

- No unhandled page errors.
- No repeated render-loop exceptions.
- No Chrome GPU error matching `Attempt to read from an uninitialized SharedImage`.
- If Chrome log capture is unavailable in CI, the screenshot and page-error gates remain required.

### Required Performance Tests

Add a high-refresh oriented spec under `frontend/tests/e2e/gpu-flow/`.

The primary performance scene must be realistic. Prefer the real Settings project's All Settings page. If that fixture is too expensive or brittle for a specific CI lane, add a generated All Settings-like fixture that matches the observed complexity: many sections, dense parameter rows, mixed retained control types, nested row groups, large scrollable section bodies, visible and offscreen sections, active DOM island candidates, retained scrollbars, and enough retained pages to exercise texture replacement and eviction. Tiny synthetic graphs can be supplemental stress coverage, but they are not an acceptable primary proof for this plan.

Scenario:

- Measure idle rAF baseline first.
- Run warm and cold panning across the large All Settings-like scene at multiple zoom levels.
- Run warm and cold zooming around dense section clusters.
- Run section body scrolling inside large settings sections.
- Include at least one run immediately after Core -> All Settings.

Assertions:

- The target is 120 fps-class interaction: p95 frame interval at or below 8.33ms and p99 no worse than one missed 120Hz frame when the measured idle/display baseline supports it.
- The non-flaky normalized gate is p95 no worse than `max(8.33ms, idleP95 * 1.15)` and p99 no worse than one missed measured baseline frame.
- No long task above 50ms during input windows.
- Input-to-render latency is recorded and bounded.
- Visible blank-content windows are recorded and must stay within the base-readability threshold.
- If 120 fps-class performance is impossible on a specific machine/browser/display combination, the test report must prove that with idle baseline, hardware, browser version, scene size, before/after numbers, and the limiting factor. The fallback target must stay in the same range: no sustained interaction below the measured display refresh class, no repeated multi-frame gaps, and no repair/refinement-induced long tasks.

The first PR should not "fix" the tests. It should demonstrate that the current implementation fails for the same user-visible issues.

## Regression Rule

Do not accept an implementation slice based only on the new repro tests. Each slice must run and report the full GPU Flow-related suite, including:

- GPU Flow unit and integration tests under `frontend/src/gpuFlow/`
- GPU Flow project-surface tests under `frontend/src/components/Pages/Project/GpuProjectSurface/`
- GPU Flow E2E specs under `frontend/tests/e2e/gpu-flow/`
- the new visual-continuity and motion tests from this plan
- any focused tests for files touched by the slice

If a slice changes shared retained-rendering behavior, active DOM island behavior, texture lifecycle behavior, hit testing, scrolling, viewport motion, or settings project rendering, it must include the broader GPU Flow suite in verification. A passing result from the new cold Settings repro is not enough because it can miss regressions in panning, zooming, section scrolling, active DOM island attach/detach, retained controls, row hover, keyboard handling, hit testing, texture eviction, and project-surface integration.

Verification output for every implementation slice should include:

- exact commands run
- pass/fail status
- any skipped tests and a narrow justification
- browser/refresh-rate baseline for performance-sensitive checks
- residual risk if a relevant suite could not run

## Target Architecture

### 1. Retained Visual Ownership Model

Introduce an explicit ownership model for every visible retained rect:

| Owner | Purpose | Publish rule |
| --- | --- | --- |
| `base` | deterministic passive canvas/GPU pixels from retained descriptors | required before first visible publication |
| `snapshot-exact` | DOM/native element capture for higher fidelity | optional refinement after base |
| `active-dom` | real DOM island for focused/edited controls | exclusive visual owner for its rect |
| `unsupported` | explicit diagnostic content for unsupported deterministic regions | visible diagnostic, never silent blank |

The display path must ask one question: "Which committed owner owns this pixel right now?" It should not infer ownership from upload queues or descriptor availability.

### 2. Visual Epoch Store

Replace direct publication of retained page descriptors with committed visual epochs.

Conceptual type:

```ts
type RetainedVisualEpochKind = "base" | "snapshot-exact" | "active-dom";

type RetainedVisualEpoch = {
  readonly surfaceId: string;
  readonly generation: number;
  readonly kind: RetainedVisualEpochKind;
  readonly dpr: number;
  readonly zoomBucket: number;
  readonly layoutVersion: number;
  readonly styleKey: string;
  readonly contentVersion: string;
  readonly committedCoverage: readonly Rect[];
  readonly pages: readonly RetainedPageHandle[];
};
```

Rules:

- Display frames sample only committed epochs.
- A building epoch is invisible until all required coverage for its visual group is complete.
- Previous compatible epochs stay alive until replacement epochs commit.
- Base and snapshot-exact epochs have distinct identities. A snapshot-exact target must not make base coverage appear missing.
- Epoch keys include owner kind, layout/style/content version, dpr, zoom bucket, and surface identity.
- Page resources are an implementation detail of an epoch, not the display contract.

### 3. Section Visual Groups

Settings sections have cross-surface publication requirements:

- section chrome
- retained passive body base
- scrollbars
- active DOM islands
- snapshot refinements

Commit these as visual groups.

Rules:

- Chrome for a new group must not publish over blank deterministic body content.
- If a new group is not ready, keep the previous committed group or show an explicit staged state outside the canvas content area.
- Section scrollbars must reflect the same body epoch they visually scroll.
- All Settings may stage many groups, but only readable base groups become visible.

### 4. Deterministic Passive Renderer Becomes Canonical

For ordinary settings rows, the deterministic canvas/GPU renderer should be the canonical passive renderer, not a temporary fallback.

It must draw:

- row labels
- scalar text values
- shortcut values
- readonly/disabled text
- checkboxes
- switches
- dropdown display text
- numeric/date/time summaries
- color swatches
- selected, hovered, disabled, error, and passive focused states
- scrollbars and clipped row bodies

Snapshot-exact should be reserved for content that truly cannot be represented from descriptors. It must not silently restyle deterministic text rows after base content has already appeared.

### 5. Snapshot Producer

Replace upload-time snapshot readiness polling with an event-driven snapshot producer.

Responsibilities:

- subscribe to source invalidation, layout, paint readiness, active/passive transitions, and style changes
- coalesce work per animation frame
- produce snapshot generations keyed by source identity, content, layout, style, dpr, and zoom bucket
- expose readiness as data before upload work is scheduled
- mark unavailable snapshots after bounded attempts without retry storms
- keep base epochs visible while snapshot-exact epochs are unavailable

Native APIs should sit behind this producer:

- `drawElementImage`
- `texElementImage2D`
- `copyElementImageToTexture`
- fallback rasterization where required

Before first snapshot, snapshot-exact is unavailable, not blank.

### 6. Active DOM Island Exclusivity

Active DOM islands need an explicit transaction model.

Attach:

- compute the retained control rect
- publish active DOM island geometry
- suppress passive value rendering in that rect for the same committed visual group
- keep labels, row backgrounds, selection, and surrounding passive content visible

Survive:

- move the DOM island by transform as the viewport pans, zooms, and scrolls
- do not recapture retained base content every motion frame
- keep hit testing aligned

Commit detach:

- commit the edited value to the authoritative owner
- build a new passive base epoch that includes the new value
- remove the DOM island only when the passive replacement is committed

Replace:

- never publish a frame with two visible text owners for the same control rect
- never publish a frame with no owner for the active control rect

### 7. Motion-First Runtime

Pan and zoom must be independent from retained repair and snapshot refinement.

Rules:

- Runtime viewport transforms are consumed immediately by the compositor.
- Public store synchronization may be deferred during active input, but the visible canvas must move.
- Retained coverage repair and exact refinement run against predicted or committed visible regions, but cannot block motion.
- Render-loop exceptions are not an acceptable control-flow path for unready retained content.

### 8. Resource Lifecycle

Keep logical visual handles stable and swap backing resources only after complete replacement.

Rules:

- A texture/page handle exposed to display stays valid for the committed frame.
- Backing GPU allocation can be recreated on size changes, but only behind a completed epoch.
- Uninitialized resources are never sampled.
- Retired resources are protected until no committed display frame can reference them.
- Memory pressure may evict unreferenced refinements first, then compatible old epochs, but not the current visible base group.

### 9. Diagnostics

Add diagnostics that explain visual ownership without tests depending on them:

- committed epoch summaries by surface and kind
- staged epoch readiness
- active owner rects
- snapshot producer readiness and unavailable states
- visual group commit/delay reasons
- last committed frame id after view switch
- input-to-visible-frame latency
- page errors and GPU-log markers captured by Chrome recording

Diagnostics should be stable enough for debugging recordings, but test gates should remain user-observable.

## Implementation Slices

### Slice 0: Failing Tests And Baseline

Deliver:

- failing E2E tests listed in Step 1
- focused renderer behavior tests for active DOM exclusivity and base readability
- baseline report under `perf/`

No production fix in this slice.

Exit criteria:

- The baseline report records the latest failing Chrome recording path, `637`
  page errors, the first `Retained deterministic visible base coverage did not
  make pre-publish repair progress` timestamp/message, and the Chrome
  `Attempt to read from an uninitialized SharedImage` log line.
- At least one failing test proves Core -> All Settings accepts input but does
  not produce visible motion after the render-loop failure.
- At least one failing visual test proves passive/active text ownership overlap
  or delayed passive row restyling using pixels, not retained internals.

### Slice 1: Visual Ownership Types

Deliver:

- explicit owner model for base, snapshot-exact, active-dom, unsupported
- visual group model for settings sections
- tests proving the display API cannot represent silent deterministic blanks
- full GPU Flow-related suite run and reported

Delete direct "descriptor is publishable" assumptions where the display layer currently uses them.

Exit criteria:

- A display caller must choose a committed owner for every visible deterministic
  retained rect or an explicit `unsupported` diagnostic owner.
- There is no API state where deterministic passive content can be represented
  as publishable with no base owner.
- Snapshot-exact ownership is represented separately from base ownership.

### Slice 2: Canonical Deterministic Base Renderer

Deliver:

- deterministic passive renderer coverage for visible settings row kinds used by Core and All Settings
- an inventory of Core and All Settings deterministic row kinds, the descriptor
  fields they already expose, and any missing fields that must be exported from
  the owner path
- pixel tests for labels, shortcut text, scalar values, disabled text, switches, checkboxes, dropdown summaries, color swatches, and scrollbars
- removal of snapshot-exact as the first-visible source for ordinary text-like rows
- full GPU Flow-related suite run and reported

Exit criteria:

- Ordinary text-like, scalar, switch, checkbox, dropdown, color, date/time, and
  scrollbar visuals can render readable passive base pixels from descriptors.
- Missing descriptor fields are exported from the existing owner path or called
  out as explicit unsupported regions; they are not filled by a handwritten
  TypeScript settings mirror.
- Snapshot-exact unavailability cannot make ordinary deterministic settings
  rows blank or unpublishable.

### Slice 3: Visual Epoch Store And Atomic Commit

Deliver:

- committed epoch store
- staged epoch builder
- previous-epoch retention until replacement commit
- section visual group transaction
- display path samples only committed epochs
- full GPU Flow-related suite run and reported

Delete the path that publishes visible true holes for deterministic passive content.

Exit criteria:

- Display frames cannot sample building descriptors or uncommitted page
  resources.
- A test proves an unready `snapshot-exact` epoch does not block or replace a
  ready base epoch.
- A Core -> All Settings transition keeps the previous committed group or an
  explicit staged state until the new deterministic base group is readable.
- The old true-hole publication path is deleted, not shadowed behind a
  compatibility branch.

### Slice 4: Event-Driven Snapshot Producer

Deliver:

- snapshot producer with readiness events and unavailable states
- native API adapter for available HTML-in-Canvas APIs
- fallback adapter where the current platform requires it
- no upload-time snapshot readiness polling in the display-critical path
- full GPU Flow-related suite run and reported

Delete retry storms and render-loop exceptions for unavailable snapshot refinement.

Exit criteria:

- Snapshot readiness is observable before upload work is scheduled.
- Upload-time polling is not on the display-critical path.
- An unavailable snapshot-exact refinement keeps the committed base epoch
  visible and records an unavailable state instead of throwing in the frame loop.
- Native HTML-in-Canvas support and fallback rasterization sit behind the same
  snapshot producer contract.

### Slice 5: Active DOM Island Transactions

Deliver:

- exclusive owner masks for active control rects
- attach, survive, commit-detach, and replace transactions
- passive value suppression under active islands
- viewport/scroll transform synchronization for DOM islands
- tests for no overlap and no blank during attach/detach
- full GPU Flow-related suite run and reported

This slice may start after Slice 3 if active-control overlap remains the most
urgent user-visible failure. It does not have to wait for the full snapshot
producer, but it must use the same owner and visual-group model.

Exit criteria:

- Attach publishes active DOM island geometry and suppresses passive value
  pixels for the same committed visual group.
- Pan, zoom, and retained section scroll move the active island by transform
  without requiring retained recapture.
- Detach keeps the active island visible until a passive base epoch containing
  the edited value is committed.
- Tests prove no frame has two visible text owners or no visible owner for the
  active control rect.

### Slice 6: Motion-First Compositor

Deliver:

- pan/zoom visible movement independent of repair/refinement
- stable old/new visual group transition for Core -> All Settings
- normalized frame-rate gates passing on cold and warm runs
- no render-loop exception wedge on unready content
- full GPU Flow-related suite run and reported

Exit criteria:

- Runtime viewport transforms visibly update the canvas while retained repair
  or snapshot refinement work is pending.
- Core -> All Settings followed immediately by wheel and pointer pan produces
  visible movement in the input direction within the latency budget.
- Unready retained content is reported through diagnostics and staged visual
  state, not frame-loop exceptions.

### Slice 7: Cleanup

Deliver:

- remove replaced retained publication, snapshot polling, and compatibility paths
- remove stale diagnostics that describe queues as the source of display truth
- update docs for the new visual ownership contract
- full GPU Flow-related suite, GPU Flow E2E behavior suite, and GPU Flow performance suite run and reported

Exit criteria:

- No dual publication path, old-field alias, transitional adapter, or
  compatibility branch remains for retained visual publication.
- Diagnostics describe committed owners, staged epochs, and visual groups rather
  than upload queues as the source of display truth.
- Architecture docs match the implemented owner/epoch contract.

## Acceptance Criteria

Functional:

- Cold Settings input visuals do not change appearance after one second.
- Clicking a text-like input never shows overlapping passive and active text.
- Core -> All Settings does not block pan or zoom.
- All Settings first-visible deterministic rows are readable within two animation frames of section shell visibility.
- No unhandled page errors in the view-switch and active-control scenarios.
- No uninitialized SharedImage reads in the Chrome recording when Chrome logs are available.

Performance:

- A large complex scene matching the Settings project's All Settings page is the primary performance proof for panning, zooming, and section scrolling.
- Warm and cold pan/zoom/section-scroll target 120 fps-class responsiveness: p95 at or below 8.33ms and p99 no worse than one missed 120Hz frame when the measured idle/display baseline supports it.
- Warm and cold pan/zoom/section-scroll p95 frame interval is no worse than `max(8.33ms, idleP95 * 1.15)` on 120Hz-capable local runs.
- Functional CI gate remains no worse than `max(16.7ms, idleP95 * 1.25)` unless CI baseline proves a lower refresh class.
- No long task above 50ms during measured interaction windows.
- Input-to-visible-movement latency is recorded and bounded.
- Any claim that 120 fps-class performance is impossible must include measured idle baseline, hardware/browser/display details, scene size, before/after numbers, and a fallback target still in the measured refresh-rate range.

Architecture:

- Display frames consume committed visual epochs.
- Snapshot-exact is refinement, not the base readability gate.
- Active DOM islands have exclusive visual ownership.
- View switches commit visual groups atomically.
- No backward-compatibility shim, old-field alias, dual publication path, or transitional adapter remains after cleanup.

## Risks

- The deterministic base renderer must be broad enough to cover settings controls without reintroducing snapshot dependency for ordinary rows.
- Visual group staging can hide missing base coverage if tests do not sample real pixels. The Step 1 screenshot/canvas gates are mandatory.
- Event-driven snapshot capture depends on browser capability. The architecture must treat unavailable exact snapshots as a visible-base state, not as a fatal display state.
- Memory pressure rules need careful tests so previous committed epochs are not retired while still visible.

## Verification Command Map

Use targeted checks while building slices:

- `pnpm -C frontend exec vitest run <focused gpu-flow test>`
- `./scripts/run-playwright-e2e.sh <focused gpu-flow spec>`
- `./scripts/record-chrome-repro.sh` for browser recordings
- `./scripts/latest-chrome-recording.sh --json` to inspect repro artifacts

Use the full GPU Flow-related suite before accepting each implementation slice:

- `pnpm -C frontend exec vitest run frontend/src/gpuFlow`
- `pnpm -C frontend exec vitest run frontend/src/components/Pages/Project/GpuProjectSurface`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow`

Before completion:

- `./scripts/quality/check.sh`
- GPU Flow E2E behavior suite
- GPU Flow performance suite
- Chrome recording for the exact three reported scenarios
