# GPU Flow Browser-Style Visible Frame Conformance Checklist

Date: 2026-05-27

## Purpose

This is a companion to
`docs/plans/gpu-flow-browser-style-visible-frame-refactor-plan.md`. It is not a
new architecture plan.

Use this checklist to finish the existing browser-style visible-frame refactor.
The goal is to close the remaining gap between the implemented code and the
existing plan, not to start another planning iteration.

## Current Conclusion

The latest recording is sufficient to diagnose the failure at the scheduling
and visible publication boundary. It does not look like a primary wheel-input
or backend failure.

Latest recording inspected:

```text
/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260527-085014
```

Observed facts:

- retained section wheel events are received and retained scroll flushes update
  offsets;
- viewport runtime frames update during pan and zoom;
- visible-frame outcomes are dominated by `motion-active` and `hold-previous`;
- content and maintenance debt remain true for long stretches;
- the prepared content frame remains stale while retained-scroll and viewport
  samples continue;
- initial blocked actor-family evidence did not list `section-header` as a
  first-class required family;
- performance traces show visible frame gaps and long tasks during the Settings
  flow.

Code audit update, 2026-05-27:

- production surface rendering now enters the visible-frame coordinator;
- the visible mutation path is substantially centralized behind tokened
  presentation completion;
- section shell, header, and body-clip actor families are registered and
  produced as section structure actors;
- observed-behavior Settings coverage exists as an E2E spec;
- safety, continuity, and quality debt classification and budgeted preparation
  exist in reducer and budget-broker code;
- actor resource keys are still not fully lifecycle-managed resources in the
  resource graph. They are reported as `actorResourceKeys`, while
  `candidateResourceKeys` and `resourceStates` remain focused on protected
  surface resources plus browser visual resources.

Therefore the refactor is substantially implemented in code, but it is not
strictly complete by the original plan's success criteria until the actor
resource lifecycle decision is closed and a fresh observed-browser verification
passes.

## Invariants Still Open Or Requiring Verification

| Plan invariant | Current status | Required resolution |
| --- | --- | --- |
| Motion must not starve safety or continuity repair. | Partly implemented; browser verification still required. Reducer debt classification and budgeted repair exist, but the latest recording predates or does not prove the current behavior. | Run the observed Settings flow and confirm safety or continuity debt cannot remain in an unbounded `motion-active` / `hold-previous` loop. |
| Retained section scroll must not be treated as plain projection motion when it exposes new required content. | Partly implemented. Retained scroll may still use the motion lane while coverage is present or debt is within budget. That is acceptable only if exposed retained pages and browser visuals are covered. | Verify retained-scroll horizon exposure, stale retained-scroll revision, missing retained pages, and browser visual gaps become continuity or safety debt with bounded repair. |
| Section shell/header/chrome must be explicit actor families. | Implemented in code; runtime proof still required. `section-shell`, `section-header`, and `section-body-clip` are registered actor families and produced from retained runtime section data. | Keep these actors required in manifest eligibility and verify the E2E diagnostics include ready/blocked/missing counts by family. |
| Preparation budget must exist during active gestures. | Implemented in code; browser verification still required. The budget broker reserves preparation budget during motion and selects visible resource debt. | Confirm the fresh recording shows repair work making bounded progress during pan, zoom, and retained scroll. |
| A motion-rendered frame must not suppress repair preparation. | Implemented in code shape; browser verification still required. The coordinator prepares budget-selected resources before candidate preparation and can prepare repair resources while presenting/projecting motion. | Confirm no motion path or work-plan skip prevents safety or continuity resource preparation in the fresh recording. |
| All user-visible actor resources must be represented by the resource lifecycle or by an explicitly justified manifest authority. | Still open. Actor resource keys are generated, but they are not part of `candidateResourceKeys` / `resourceStates`. | Decide and implement the authority: either promote actor resources into lifecycle-managed graph entries, or document why manifest eligibility, not resource lifecycle, is the authority for actor families. |
| Debt may clear only after the chosen visible outcome actually presents. | Substantially code-proven; runtime verification still required. Boundary tests cover visible canvas, DOM projection, browser visual projection, retained display state, and public projection state. | Keep the presentation-token boundary tests and confirm diagnostics do not show partial publication or stale debt clearing in the fresh recording. |
| Observed behavior, not frame-internal invariants alone, defines completion. | Test coverage exists; completion is unverified. The Settings observed-failure spec now covers first render, retained scroll, pan/zoom cadence, flicker, and latest-recording parity. | Run the observed E2E spec and capture a fresh Chrome recording as the final pass/fail oracle. |

## Implementation Checklist

### 1. Keep This As Existing-Plan Conformance

- [x] Do not write a new GPU Flow architecture plan for this failure.
- [x] Treat
  `docs/plans/gpu-flow-browser-style-visible-frame-refactor-plan.md` as the
  governing contract.
- [ ] Do not add another retry guard, compatibility switch, transitional path,
  or Settings-specific renderer shortcut.
- [ ] If product stabilization is required before this work is complete, follow
  the existing plan's hard rollback guidance instead of mixing two publication
  systems in one runtime.

### 2. Run And Tighten Observed-Behavior Tests

- [x] Add Settings first-render integrity coverage for visible section headers,
  section chrome, retained row content, and browser-owned values after settle.
- [x] Add retained section scroll coverage that dispatches native wheel input
  over a scrollable retained section body and asserts that visible body pixels
  move while header/chrome stays visible and stationary.
- [x] Add pan/zoom cadence coverage that mirrors the latest manual recording
  shape and asserts no long task over 50 ms during measured interaction windows.
- [x] Add flicker coverage that samples consecutive frames and fails if stable
  header, body, value, or section chrome regions alternate between present and
  blank.
- [x] Attach diagnostics to failures while keeping screenshots, pixel regions,
  frame cadence, and long-task budgets as the pass/fail oracle.
- [ ] Run the observed-failure spec against the current implementation and
  record whether each scenario passes, flakes, or still fails.
- [ ] Tighten any assertion that passes despite visible blanking, stale scroll
  pixels, DOM/control drift, or long motion tasks.

### 3. Complete The Required Actor Manifest

- [x] Include `section-shell`, `section-header`, section chrome,
  `section-body-clip`, `retained-page`, retained native visuals,
  browser-owned controls, DOM islands, viewport portal, hit generation,
  accessibility exposure, debug snapshot, public runtime state, scene
  background, grid, and edges.
- [x] Produce section shell/header/body-clip actors from retained runtime
  section data.
- [x] Add synthetic blocked manifest entries for missing required section
  structure actors.
- [ ] Verify required actor families are derived from the sampled scene and
  viewport before visible candidate eligibility is accepted.
- [ ] Make missing section shell/header/chrome a hard eligibility blocker unless
  the scene provides an explicit reason they are absent.
- [ ] Report required, ready, compatible, blocked, and missing counts by family
  in diagnostics.
- [ ] Ensure section/header/body clip transforms are all derived from the same
  presentation matrix as canvas and browser-owned DOM actors.
- [ ] Close the actor-resource lifecycle gap: promote actor resource keys into
  graph-managed candidate resources, or explicitly define manifest eligibility
  as the actor-family authority.

### 4. Reclassify Retained Scroll Debt

- [x] Add safety, continuity, and quality debt classification with age.
- [x] Allow retained scroll to use projection only while continuity debt remains
  within its bounded repair budget.
- [ ] Treat retained scroll as continuity-sensitive content motion whenever it
  exposes new required content, not as plain projection motion.
- [ ] Track desired and presented retained-scroll revisions per visible retained
  surface.
- [ ] Track retained page coverage for current and near-future scroll exposure.
- [ ] Track browser control live-host or snapshot coverage for the same scroll
  horizon.
- [ ] Treat scroll deltas that expose uncovered rows, stale browser visuals, or
  missing retained pages as continuity or safety debt with age and deadline.
- [ ] Keep section header/chrome stationary relative to the section surface
  through scroll projection.

### 5. Fix Lane Selection And Debt Aging

- [x] Add explicit debt class and age to the reducer state: safety, continuity,
  and quality.
- [x] Allow motion to preempt quality debt.
- [x] Force retained-scroll content repair when continuity debt exceeds the
  reducer probe budget.
- [x] Fail loudly in the budget broker when over-budget visible debt remains
  deferred.
- [ ] Stop allowing `retained-scroll` to suppress competing content or
  maintenance reasons when safety or continuity debt exists.
- [ ] Prevent motion from indefinitely preempting safety or continuity debt in
  the observed browser flow, not only in reducer/budget unit tests.
- [ ] When safety debt exists, select repair or block loudly instead of
  presenting lower-coverage content as success.
- [ ] When continuity debt exceeds its budget, force repair or hold with an
  over-budget diagnostic instead of continuing a healthy `motion-active` loop in
  browser diagnostics.
- [ ] Clear content, maintenance, and motion debt only after the selected
  visible outcome actually presents or intentionally resolves that debt.

### 6. Decouple Motion Presentation From Repair Preparation

- [x] Preserve the fast path:
  `Projected frame = transform(previous complete presentation, current motion sample)`.
- [x] Allow a frame to present/project the previous complete presentation while
  also preparing safety or continuity repair resources for a future present.
- [x] Apply the budget broker before candidate preparation so selected resource
  work can start during active gestures.
- [ ] Remove any rule where `renderedProjectionOnlyFrame` or motion lane
  selection automatically skips safety or continuity content preparation.
- [ ] Ensure texture uploads, browser visual host preparation, retained page
  rasterization, and snapshot capture remain preparation work and do not mutate
  visible state until `Present`.
- [ ] Verify in a fresh Chrome recording that selected repair resources advance
  while motion projection remains responsive.

### 7. Enforce The Presentation Boundary

- [x] Treat `PresentedFrame` as the only state that can mutate visible canvas,
  DOM projection, browser visual hosts, retained display state, public runtime
  state, hit generation, accessibility exposure, debug snapshots, and resource
  retirement.
- [x] Ensure held, blocked, aborted, and preparing outcomes only record
  diagnostics and schedule future work.
- [x] Keep active editors exact-live unless an explicit family-specific rule
  says otherwise.
- [ ] Stamp every visible mutation with one presentation id.
- [ ] Make compatible-previous proof family-specific and narrow.
- [ ] Verify the boundary with runtime diagnostics in addition to static
  boundary tests.

### 8. Verify Completion

- [ ] A fresh Chrome recording of the latest manual flow shows retained section
  scroll moving visible body pixels without blanking the section body, header,
  or browser-owned values.
- [ ] Pan and zoom move the whole presented map as one composed frame.
- [ ] No visible section, header band, retained body, or value/control region is
  blank after settle.
- [ ] Frame cadence meets the plan budget: no long task over 50 ms during
  measured pan, zoom, or retained-scroll windows on standard-refresh displays.
- [ ] Presentation diagnostics no longer show unbounded `motion-active` /
  `hold-previous` loops while safety or continuity debt remains true.
- [ ] `./scripts/quality/check.sh` passes for the working tree before the
  implementation is considered complete.

## Diagnostic Fields To Keep Or Add Temporarily

If the next reproduction needs more detail, capture these per frame:

- `presentationId`;
- selected lane and reducer state;
- outcome;
- raw frame reasons;
- desired and presented retained-scroll revision by surface;
- prepared and presented content frame ids;
- safety, continuity, and quality debt age;
- selected budgeted repair work;
- content preparation work-plan kind;
- content preparation skip reason;
- required, ready, compatible, blocked, and missing actor counts by family;
- section header/chrome actor readiness;
- retained scroll horizon coverage;
- held-previous age in frames and milliseconds.

These diagnostics are temporary proof aids. They should not become a second
publication system or a rendering policy input.
