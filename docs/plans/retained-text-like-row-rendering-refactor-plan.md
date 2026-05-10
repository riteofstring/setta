# Retained Text Runtime Refactor Plan

## Goal

Fix the remaining retained text-like row issues with a principled refactor:

- Pan and zoom should stay smooth because they are mostly GPU transform work over already-retained content.
- Visible text-like rows should not disappear, go transparent, or require a click before their content appears.
- Active CodeMirror DOM islands should be an editing overlay, not a prerequisite for seeing the value.

The settings-shell `TextAreaParam` data bug is separate. This plan assumes compact settings fields are no longer incorrectly modeled as multiline text areas.

## Constraints

- The first implementation step is writing tests that capture the current user-visible failures.
- Tests must assert behavior, not private implementation details.
- No backward compatibility shims, dual paths, legacy fallbacks, or transitional adapters.
- Prefer deleting or replacing the old retained text path over layering another mode on top of it.
- Performance work must baseline first, re-measure after, and record results under `perf/`.

## Step 1: Behavior Tests First

This step is a hard gate. Do not change the retained text runtime, scheduler, promotion semantics, or active-editor handoff code until the current user-visible failures are captured by tests and a baseline report.

The Step 1 output must include:

- Browser-level disappearing-content tests that fail or expose the current blank-row behavior on the existing implementation.
- A pan/zoom or wheel benchmark baseline recorded under `perf/`.
- Active editor handoff coverage that observes the visual handoff, not only focus or DOM state.
- A short note in the plan or perf report naming the failing command, affected rows, and observed pixel/trace evidence.

Diagnostics may be added only to make the failing tests and baseline measurable. Diagnostic counters, queue names, hidden source counts, or source-key matches are not acceptance criteria by themselves.

If a proposed test passes on the current implementation, it does not satisfy this gate unless it is paired with another test or recording that reproduces the 2026-05-13 blank-row failure. Tighten the scenario before moving to Step 2.

### Disappearing Content Tests

Add browser-level coverage for a settings page scenario with many retained text-like rows.

Target behaviors:

- A visible text-like row with a non-empty value has nonblank pixels before it is clicked.
- Clicking a text-like row does not create the first visible rendering of its value.
- During activation, the passive retained content remains visible until the active DOM editor is visibly painted.
- During deactivation, either the active editor or the passive retained texture remains visible; there is no blank handoff frame.
- Scrolling a section to newly visible text-like rows produces visible text without requiring a click.

Suggested test shape:

- Use Playwright or the existing GPU-flow E2E harness.
- Navigate to a deterministic settings view with rows such as `sectionSizingPolicy` and `callableSectionDefault`.
- Use canvas pixel probes around the known control text bounds.
- Assert nonblank/nontransparent pixels before click, after click, after blur, and after section scroll.
- Avoid assertions about texture cache state, scheduler queue names, hidden DOM node counts, or component internals.

Required failing scenarios:

- At least one visible single-line text row in `sectionSizingPolicy`, such as `sectionSizingPolicy.metaControlByType.TextParam.minHeight`, must be checked before click.
- At least one compact structured scalar row in `callableSectionDefault`, such as `columnWidth`, `edgeInputParams`, or `edgeOutputPorts`, must be checked before click and after activation.
- The test must run against a retained-content-heavy settings view, preferably All Settings, so the failure includes scheduler and many-row pressure.
- The assertion must be based on canvas pixels in or tightly around the row value/control bounds. A present source DOM element, matched source key, mounted CodeMirror editor, or non-empty debug row record is not enough.
- Clicking a blank row may be used as part of the test, but the test must prove that the click was not the first visible rendering path.

### Pan/Zoom Performance Tests

Add a reproducible pan/zoom benchmark around the same retained-content-heavy view.

Target behaviors:

- Pan/zoom input does not produce visible blank text-like rows.
- Visible text-like rows remain visible while transforms are changing.
- Frame gaps and long tasks stay within an explicit budget captured from the current baseline and tightened after the fix.
- Texture upload work is bounded during active pan/zoom.

Suggested test shape:

- Use a Chrome recording or automated CDP trace for a fixed wheel/pan script.
- Record frame gaps, long tasks, visible blank row count, and upload bytes/count when available.
- Store the before/after reports in `perf/` as append-only evidence.
- Treat visual nonblank checks as the correctness gate and trace metrics as performance gates.

Baseline requirements:

- Capture the current baseline before any runtime refactor.
- Report frame gaps, long tasks, upload count/bytes, skipped or queued work counts when available, and visible blank-row count.
- Name the command or script used to capture the baseline so the after report can repeat it.
- Do not accept a benchmark that only proves smooth scrolling while visible text remains blank.

### Active Editor Interaction Tests

Add focused frontend tests around retained text activation semantics.

Target behaviors:

- Activating a row mounts the editor at the same geometry as the retained text control.
- Focus and typing work after activation.
- The row value remains visible before the editor is ready.
- Blurring or committing does not produce a blank visual handoff.

These tests can use component-level rendering where browser pixel checks are not required, but they should still assert observable DOM/visual behavior rather than internal state names.

Required handoff checks:

- Before activation, the passive value must be visibly nonblank.
- During activation, the old passive visual must remain visible until the active editor has painted at the aligned geometry.
- During deactivation, either the active editor or a passive visual must remain visible in the row bounds.
- Focus and typing are necessary but not sufficient; they do not prove the visual handoff is correct.

### Step 1 Exit Criteria

Step 1 is complete only when all of the following are true:

- The disappearing-content test or Chrome recording reproduces the current blank-row failure on the existing implementation.
- The failing evidence includes at least one canvas pixel probe over a specific retained text-like row value/control area.
- The pan/zoom baseline exists under `perf/` with command, scenario, frame/long-task metrics, upload pressure, and blank-row count.
- The active editor handoff test covers passive-before-click and activation/deactivation visibility.
- The next runtime change can be judged by making these tests pass and by comparing the after report against the baseline.

Do not proceed to Step 2 with only source DOM readiness tests, queue diagnostics, source-key equality checks, or aggregate retained page counters.

## Target Architecture

### 1. Row-Owned Passive Texture Lifecycle

Each retained text-like row should own a passive visual asset with a small lifecycle:

- No passive visual exists yet.
- A passive visual exists and matches the current row content/layout key.
- A passive visual exists but is stale while a replacement is being prepared.
- An active DOM editor is mounted over the row.

The core invariant: a visible row should never drop its old passive visual until a replacement visual or active editor is visibly ready.

Stale visible text is acceptable during a short refresh window. Transparent or missing visible text is not.

### 2. Explicit Paint Boundary

Adopt the HTML-in-canvas style model:

- Row content changes request a paint.
- The hidden/source DOM for a row has a specific source key.
- A source key is promoted only after the DOM source has painted and the canvas/GPU upload has succeeded.
- If the source DOM is missing, stale, or not yet painted, the renderer keeps drawing the previous passive visual.

This removes the current ambiguity where React, hidden DOM, canvas copy, and texture upload can each be at different versions.

### 3. Priority Upload Scheduler

Texture work should be split by user-visible priority:

1. Visible rows with no passive visual.
2. Active editor handoff and deactivation replacement work.
3. Visible rows with stale passive visuals.
4. Visible refinement for sharper text.
5. Offscreen and idle prefetch work.

During active pan/zoom, refinement and prefetch should not starve visible missing or handoff work. The pan/zoom frame should draw cached content first and schedule maintenance after.

### 4. Active CodeMirror Overlay Contract

CodeMirror DOM islands should be an overlay for editing:

- Passive retained content remains visible during activation.
- The active editor becomes interactive only when it is geometrically aligned and visibly painted.
- On blur, the active editor remains visible until the passive replacement is ready, or the old passive visual is still drawn behind it.

Clicking should not be the event that makes an otherwise blank value visible.

### 5. Pan/Zoom Runtime Ownership

Pan, zoom, viewport, section scroll offsets, visible row windows, and dirty row scheduling should be owned by a retained runtime, not distributed across React render timing.

The hot path for pan/zoom should be:

1. Coalesce input into one animation-frame update.
2. Update transforms/uniforms.
3. Draw existing retained visuals.
4. Enqueue maintenance after the frame.

The hot path should not require CodeMirror initialization, hidden DOM creation, broad React state churn, or synchronous texture replacement.

## Implementation Plan

1. **Write Behavior Tests**
   - Add the disappearing-content browser tests.
   - Add the pan/zoom benchmark and baseline report.
   - Add active editor handoff tests.
   - Capture the current failures before runtime changes.

2. **Replace Passive Texture Ownership**
   - Introduce row-owned passive visual records keyed by content, layout, size, and DPR.
   - Keep stale visuals drawable while replacements are prepared.
   - Remove any path that clears visible row content before a replacement is ready.

3. **Replace Snapshot Promotion Semantics**
   - Promote a row source only after painted source DOM and successful upload are both observed.
   - Treat missing/stale source DOM as a reason to keep the previous passive visual.
   - Delete source-key mismatch paths that produce blank visible output.

4. **Replace Upload Scheduling**
   - Implement priority lanes for visible missing rows, handoffs, stale visible rows, refinement, and idle work.
   - Enforce that visible missing/handoff work runs before refinement.
   - Bound upload work during active pan/zoom.

5. **Refactor Active Editor Handoff**
   - Keep passive visuals during activation.
   - Gate editor visibility/interactivity on actual editor readiness and geometry alignment.
   - Keep either active editor or passive visual visible during deactivation.

6. **Move Pan/Zoom and Scroll Runtime State Out of React Timing**
   - Centralize viewport transform and section scroll ownership in the retained runtime.
   - Make pan/zoom draw from existing retained visuals without waiting for React layout.
   - Schedule text maintenance separately from interaction transforms.

7. **Delete Superseded Retained Text Paths**
   - Remove old blank-prone promotion/clearing paths.
   - Remove diagnostic-only code that is no longer needed once behavior tests and perf reports cover the issues.
   - Do not keep a compatibility branch for the old retained text behavior.

8. **Re-measure and Close**
   - Re-run the behavior tests.
   - Re-run the Chrome pan/zoom recording.
   - Write the after report in `perf/`.
   - Compare before/after frame gaps, long tasks, visible blank rows, and upload work.

## Acceptance Criteria

- Visible text-like rows are nonblank before click.
- Activation and deactivation never produce a blank visual handoff.
- Section scroll does not expose blank text-like rows that require click-to-render.
- Pan/zoom does not make existing retained text disappear.
- Pan/zoom trace metrics improve or stay within the documented budget from the baseline.
- Texture upload work during active pan/zoom is bounded and does not starve visible missing rows.
- The old blank-prone retained text path is deleted, not kept as a compatibility fallback.

## Ideas Borrowed From HTML-In-Canvas Examples

- Use explicit paint boundaries and source promotion instead of assuming DOM readiness.
- Keep stable texture objects/references where possible so resize and transform work do not invalidate render state unnecessarily.
- Align active DOM overlays with the rendered canvas geometry instead of relying on synthetic event translation.
- Use pixel-level visual checks as correctness tests; internal counters are supporting diagnostics, not proof.
