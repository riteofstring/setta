# GPU Flow Browser-Style Visible Frame Conformance Checklist

Date: 2026-05-27

## Purpose

This is a companion to
`docs/plans/gpu-flow-browser-style-visible-frame-refactor-plan.md`. It is not a
new architecture plan.

Use this checklist to continue the existing browser-style visible-frame
refactor after the latest Chrome recording showed that the plan's behavioral
contract is still not satisfied. The goal is to close the gap between the
implemented code and the existing plan, not to start another planning
iteration.

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
- initial blocked actor-family evidence does not list `section-header` as a
  first-class required family;
- performance traces show visible frame gaps and long tasks during the Settings
  flow.

Therefore the refactor is incomplete by the original plan's own success
criteria. The next work should be a conformance pass against that plan.

## Invariants Still Violated Or Unproven

| Plan invariant | Current status | Required resolution |
| --- | --- | --- |
| Motion must not starve safety or continuity repair. | Violated. The recording shows repeated `motion-active` / `hold-previous` outcomes while content and maintenance debt remain true. | Lane selection must force repair or loud blocking when safety or continuity debt ages beyond budget. |
| Retained section scroll must not be treated as plain projection motion when it exposes new required content. | Violated. `retained-scroll` keeps the reducer in motion behavior while visible content debt persists. | Classify retained scroll horizon exposure, stale retained-scroll revision, missing retained pages, and browser visual gaps as continuity or safety debt. |
| Section shell/header/chrome must be explicit actor families. | Violated or at least unproven. The blocker evidence lists section shell and body clip but not `section-header`. | Add `section-header` and section chrome readiness to the required visible actor manifest and eligibility proof. |
| Preparation budget must exist during active gestures. | Violated in effect. Content/maintenance repair is not making bounded progress while motion remains active. | The budget broker must reserve preparation time for safety and continuity debt during motion. |
| A motion-rendered frame must not suppress repair preparation. | Violated by behavior and needs code audit. Motion projection appears to keep content preparation skipped or deferred. | Content repair preparation must be allowed even when the visible outcome is a motion projection over the previous presentation. |
| Debt may clear only after the chosen visible outcome actually presents. | Needs audit. The logs show debt persisting, but the authority boundary still needs to be checked for partial or stale effects. | Verify debt completion, browser host promotion, retained display state, public state, hit/debug state, and resource retirement are all presentation-token gated. |
| Observed behavior, not frame-internal invariants alone, defines completion. | Needs audit. The latest user recording still fails the user-facing behavior. | Add or tighten pixel/cadence tests for first render, retained scroll, pan/zoom, and flicker. |

## Implementation Checklist

### 1. Keep This As Existing-Plan Conformance

- [ ] Do not write a new GPU Flow architecture plan for this failure.
- [ ] Treat
  `docs/plans/gpu-flow-browser-style-visible-frame-refactor-plan.md` as the
  governing contract.
- [ ] Do not add another retry guard, compatibility switch, transitional path,
  or Settings-specific renderer shortcut.
- [ ] If product stabilization is required before this work is complete, follow
  the existing plan's hard rollback guidance instead of mixing two publication
  systems in one runtime.

### 2. Prove The Current Gap With Observed-Behavior Tests

- [ ] Ensure the Settings first-render integrity test fails on the current
  broken behavior and passes only when visible section headers, section chrome,
  retained row content, and browser-owned values are present after settle.
- [ ] Ensure the retained section scroll test dispatches native wheel input over
  a scrollable retained section body and asserts that visible body pixels move
  while header/chrome stays visible and stationary.
- [ ] Ensure the pan/zoom cadence test mirrors the latest manual recording
  shape and asserts no long task over 50 ms during the measured interaction
  windows.
- [ ] Ensure the flicker test samples consecutive frames and fails if stable
  header, body, value, or section chrome regions alternate between present and
  blank.
- [ ] Attach diagnostics to failures, but keep screenshots, pixel regions,
  frame cadence, and long-task budgets as the pass/fail oracle.

### 3. Complete The Required Actor Manifest

- [ ] Derive required actor families from the sampled scene and viewport before
  candidate selection.
- [ ] Include `section-shell`, `section-header`, section chrome,
  `section-body-clip`, `retained-page`, retained native visuals,
  browser-owned controls, DOM islands, viewport portal, hit generation,
  accessibility exposure, debug snapshot, public runtime state, scene
  background, grid, and edges.
- [ ] Make missing section shell/header/chrome a hard eligibility blocker unless
  the scene provides an explicit reason they are absent.
- [ ] Report required, ready, compatible, blocked, and missing counts by family
  in diagnostics.
- [ ] Ensure section/header/body clip transforms are all derived from the same
  presentation matrix as canvas and browser-owned DOM actors.

### 4. Reclassify Retained Scroll Debt

- [ ] Treat retained scroll as continuity-sensitive content motion, not plain
  motion.
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

- [ ] Stop allowing `retained-scroll` to suppress competing content or
  maintenance reasons when safety or continuity debt exists.
- [ ] Add explicit debt class and age to the reducer state: safety, continuity,
  and quality.
- [ ] Allow motion to preempt quality debt.
- [ ] Prevent motion from indefinitely preempting safety or continuity debt.
- [ ] When safety debt exists, select repair or block loudly instead of
  presenting lower-coverage content as success.
- [ ] When continuity debt exceeds its budget, force repair or hold with an
  over-budget diagnostic instead of continuing a healthy `motion-active` loop.
- [ ] Clear content, maintenance, and motion debt only after the selected
  visible outcome actually presents or intentionally resolves that debt.

### 6. Decouple Motion Presentation From Repair Preparation

- [ ] Preserve the fast path:
  `Projected frame = transform(previous complete presentation, current motion sample)`.
- [ ] Allow a frame to present/project the previous complete presentation while
  also preparing safety or continuity repair resources for a future present.
- [ ] Remove any rule where `renderedProjectionOnlyFrame` or motion lane
  selection automatically skips safety or continuity content preparation.
- [ ] Apply the budget broker before work-plan skipping so reserved repair
  budget is actually usable during active gestures.
- [ ] Ensure texture uploads, browser visual host preparation, retained page
  rasterization, and snapshot capture remain preparation work and do not mutate
  visible state until `Present`.

### 7. Enforce The Presentation Boundary

- [ ] Treat `PresentedFrame` as the only state that can mutate visible canvas,
  DOM projection, browser visual hosts, retained display state, public runtime
  state, hit generation, accessibility exposure, debug snapshots, and resource
  retirement.
- [ ] Ensure held, blocked, aborted, and preparing outcomes only record
  diagnostics and schedule future work.
- [ ] Stamp every visible mutation with one presentation id.
- [ ] Make compatible-previous proof family-specific and narrow.
- [ ] Keep active editors exact-live unless an explicit family-specific rule
  says otherwise.

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
