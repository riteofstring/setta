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

The latest recording is sufficient to diagnose the current failure. It does not
look like a primary wheel-input or backend failure. The source-level refactor
shape exists, but the observed runtime still violates the plan's core
conformance invariant: motion projection can keep winning while continuity
repair debt remains unresolved.

Latest broken recording inspected:

```text
/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260527-153246
```

Observed facts:

- retained section wheel events are received and retained scroll flushes update
  offsets;
- viewport runtime frames update during pan and zoom;
- visible-frame outcomes are dominated by `motion-active` and
  `hold-previous`;
- content and maintenance debt remain true for hundreds of frames;
- continuity debt age grows into the 900s while the reducer still chooses
  `lane=motion`;
- the prepared content frame remains stale at frame `22` while retained-scroll
  samples continue;
- performance measures show `contentWorkPlanKind=skip` 1966 times versus
  `prepare` 27 times;
- held-previous tokens report `holdAgeFrames=1` and `holdAgeMs=0` even after
  hundreds of consecutive held outcomes, so held starvation accounting is not
  accumulating;
- performance traces still show visible frame gaps and long tasks during the
  Settings flow.

Code audit update, 2026-05-27:

- production surface rendering now enters the visible-frame coordinator;
- the visible mutation path is substantially centralized behind tokened
  presentation completion;
- section shell, header, and body-clip actor families are registered and
  produced as section structure actors;
- observed-behavior Settings coverage exists as an E2E spec;
- safety, continuity, and quality debt classification and budgeted preparation
  exist in reducer and budget-broker code;
- actor resource keys are now lifecycle-managed resources in the resource
  graph. They remain reported as `actorResourceKeys`, and are also promoted
  into `candidateResourceKeys` and `resourceStates` with family-specific
  preparation lanes;
- safety and continuity content debt now produce explicit budget debt while
  motion is active, but the latest recording shows this debt is not sufficient
  to force content preparation or visible repair.

Regression update, 2026-05-27:

- The previous final-verification claim is superseded by
  `recording-20260527-153246`.
- The plan is source-shaped but not observed-complete.
- The immediate rescue target is narrow: enforce repair-starvation invariants
  and held-previous age accumulation, then rerun the observed Settings spec and
  a fresh Chrome recording.
- If that bounded rescue still fails the observed browser gates, stop treating
  this branch as the primary path and move primary effort to the
  canvas/WebGPU-only branch.

## Invariants Still Open Or Requiring Verification

| Plan invariant | Current status | Required resolution |
| --- | --- | --- |
| Motion must not starve safety or continuity repair. | Reopened. Latest recording shows `contentDebt=true`, `continuityDebtActive=true`, and continuity age near 938 while the reducer remains on `lane=motion` and outcomes are mostly `hold-previous`. | Force content preparation or block loudly when safety/continuity debt exceeds budget. |
| Retained section scroll must not be treated as plain projection motion when it exposes new required content. | Reopened. Retained-scroll frames continue as motion/hold while the prepared content frame remains stale. | Treat over-budget retained-scroll continuity debt as content repair work, not projection-only motion. |
| Section shell/header/chrome must be explicit actor families. | Source-verified. `section-shell`, `section-header`, and `section-body-clip` are registered and produced. | Reverify in the next observed browser run after the repair-starvation fix. |
| Preparation budget must exist during active gestures. | Partially implemented but not sufficient. Budget decisions exist, but selected continuity repair does not force content preparation. | Connect selected/over-budget repair debt to the work plan that decides content candidate preparation. |
| A motion-rendered frame must not suppress repair preparation. | Reopened. `contentWorkPlanKind=skip` dominates while continuity debt remains active. | Remove the rule that `renderedProjectionOnlyFrame` or `lane=motion` automatically skips safety/continuity repair preparation. |
| All user-visible actor resources must be represented by the resource lifecycle or by an explicitly justified manifest authority. | Source-verified. Actor resource keys are graph-managed candidate resources with family-specific preparation lanes. | Reverify runtime diagnostics in the next fresh recording. |
| Debt may clear only after the chosen visible outcome actually presents. | Reopened for runtime proof. The latest recording shows debt persists rather than clears, but held accounting resets and must be fixed before this invariant can be trusted. | Verify debt completion and held age against a fresh recording after the rescue fix. |
| Observed behavior, not frame-internal invariants alone, defines completion. | Reopened. The latest Chrome recording fails the observed browser gate. | Completion requires fresh observed Settings evidence, not source audit alone. |

## Implementation Checklist

Unchecked items below are verification gates unless they explicitly say to
change implementation. If browser or diagnostic verification fails, use the
failing evidence to reopen implementation work narrowly.

### 1. Keep This As Existing-Plan Conformance

- [x] Do not write a new GPU Flow architecture plan for this failure.
- [x] Treat
  `docs/plans/gpu-flow-browser-style-visible-frame-refactor-plan.md` as the
  governing contract.
- [x] Do not add another retry guard, compatibility switch, transitional path,
  or Settings-specific renderer shortcut.
- [x] If product stabilization is required before this work is complete, follow
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
- [x] Run the observed-failure spec against the current implementation and
  record whether each scenario passes, flakes, or still fails.
- [x] Tighten any assertion that passes despite visible blanking, stale scroll
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
- [x] Verify required actor families are derived from the sampled scene and
  viewport before visible candidate eligibility is accepted.
- [x] Make missing section shell/header/chrome a hard eligibility blocker unless
  the scene provides an explicit reason they are absent.
- [x] Report required, ready, compatible, blocked, and missing counts by family
  in diagnostics.
- [x] Verify section/header/body clip transforms are all derived from the same
  presentation matrix as canvas and browser-owned DOM actors in the fresh
  browser run.
- [x] Close the actor-resource lifecycle gap: promote actor resource keys into
  graph-managed candidate resources, or explicitly define manifest eligibility
  as the actor-family authority.

### 4. Reclassify Retained Scroll Debt

- [x] Add safety, continuity, and quality debt classification with age.
- [x] Allow retained scroll to use projection only while continuity debt remains
  within its bounded repair budget.
- [x] Treat retained scroll as continuity-sensitive content motion whenever it
  exposes new required content, not as plain projection motion.
- [x] Verify diagnostics expose desired and presented retained-scroll revisions
  per visible retained surface.
- [x] Verify diagnostics expose retained page coverage for current and
  near-future scroll exposure.
- [x] Verify diagnostics expose browser control live-host or snapshot coverage
  for the same scroll horizon.
- [x] Verify scroll deltas that expose uncovered rows, stale browser visuals, or
  missing retained pages become continuity or safety debt with age and deadline.
- [x] Verify section header/chrome stays stationary relative to the section
  surface through scroll projection.

### 5. Fix Lane Selection And Debt Aging

- [x] Add explicit debt class and age to the reducer state: safety, continuity,
  and quality.
- [x] Allow motion to preempt quality debt.
- [ ] Force retained-scroll content repair when continuity debt exceeds the
  reducer probe budget.
- [ ] Fail loudly in the budget broker when over-budget visible debt remains
  deferred.
- [ ] Stop allowing `retained-scroll` to suppress competing content or
  maintenance reasons once safety or continuity debt exceeds the bounded repair
  budget.
- [ ] Verify motion does not indefinitely preempt safety or continuity debt in
  the observed browser flow, not only in reducer/budget unit tests.
- [x] Verify safety debt selects repair or blocks loudly instead of presenting
  lower-coverage content as success.
- [ ] When continuity debt exceeds its budget, force repair or hold with an
  over-budget diagnostic instead of continuing a healthy `motion-active` loop in
  browser diagnostics.
- [ ] Fix held-previous accounting so consecutive held outcomes accumulate
  `holdAgeFrames` and `holdAgeMs` across samples.
- [ ] Clear content, maintenance, and motion debt only after the selected
  visible outcome actually presents or intentionally resolves that debt.

### 6. Decouple Motion Presentation From Repair Preparation

- [x] Preserve the fast path:
  `Projected frame = transform(previous complete presentation, current motion sample)`.
- [ ] Allow a frame to present/project the previous complete presentation while
  also preparing safety or continuity repair resources for a future present.
- [x] Apply the budget broker before candidate preparation so selected resource
  work can start during active gestures.
- [ ] Remove any rule where `renderedProjectionOnlyFrame` or motion lane
  selection automatically skips safety or continuity content preparation.
- [x] Ensure texture uploads, browser visual host preparation, retained page
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
- [x] Verify runtime diagnostics stamp visible mutations with one presentation
  id.
- [x] Make compatible-previous proof family-specific and narrow.
- [x] Verify the boundary with runtime diagnostics in addition to static
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
- selected, deferred, and over-budget budget-debt ids;
- content preparation work-plan kind;
- content preparation skip reason;
- required, ready, compatible, blocked, and missing actor counts by family;
- section header/chrome actor readiness;
- retained scroll horizon coverage;
- held-previous age in frames and milliseconds.
- previous held-previous state used to compute the new hold age.

These diagnostics are temporary proof aids. They should not become a second
publication system or a rendering policy input.
