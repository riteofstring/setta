# GPU Flow Retained Settings Runtime Remaining Work Plan

Date: 2026-05-19
Status: Planned

This plan contains the remaining work after the principled projection runtime
landed. It does not re-plan the projection boundary, scheduler lanes,
transaction identity, or DOM-control projection manager that already exist.

The immediate source of truth is the latest local finish-line analyzer run:

```sh
./scripts/chrome_repro_gpuflow_finish_line_report.py --latest --markdown
```

Latest inspected artifact:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260519-101635`

## Current Failure Snapshot

The latest analyzer result failed even though projection-frame content-work
guardrails held.

Summary:

- `1369` GPU Flow frames: `1017` projection and `352` content.
- `1072` interaction-active frames.
- `4` browser long-task entries.
- `19` retained uploads, `20,802,672` retained uploaded bytes.
- Transaction outcomes: `1017` `none`, `166` `publish-exact`, `175`
  `publish-compatible`, `10` `hold-previous`, and `1`
  `publish-cold-placeholder`.
- Projection content-work violations: `0`.
- Interaction non-repair upload violations: `0`.
- Post-settle upload spikes over budget: `0`.
- True-hole publications: `0`.

Failing gates:

- `coldPlaceholderPublicationCount = 1`.
- `heldPreviousOverBudgetCount = 236`.
- `longTaskCount = 1` attributed to GPU Flow by the analyzer.
- `retainedBudgetExhaustedFrameCount = 15`.
- `retainedBudgetMissCount = 208`.
- The raw summary still has `longtaskCount = 4`, which violates the completion
  plan's Definition of Done even when some tasks are currently classified as
  outside GPU Flow.

## Goal

Make the retained Settings runtime pass the finish-line gate on a fresh Chrome
recording without relying on stale or specially filtered evidence.

Done means:

- the latest recording analyzed by `--latest` passes;
- a checked-in final report under `perf/reports/` shows no failing counters;
- raw browser long-task count is zero for the finish-line window, or the plan's
  Definition of Done is explicitly updated before claiming completion;
- projection frames still contain no content, retained page, maintenance, or
  upload work;
- retained maintenance budget misses are not normal publish outcomes;
- cold placeholders and true holes do not reach warm visible surfaces;
- held-previous age stays within the configured continuity budget.

## Non-Goals

- Do not rewrite the projection runtime boundary.
- Do not move editable or selectable text pixels back into canvas-only drawing.
- Do not relax projection-frame content-work guardrails.
- Do not add compatibility paths, old-field aliases, or silent fallback
  publication.
- Do not mark completion from a recording that lacks the finish-line gesture
  window or omits the failure-prone All Settings flow.

## Workstream 1: Tighten The Finish-Line Gate

The existing report can show `Status: PASS` while the summary still contains
browser long tasks. That is inconsistent with the completion plan's Definition
of Done.

Implementation targets:

- Make the report fail when the raw finish-line long-task count is nonzero, or
  split the metric into explicit `gpuFlowLongtaskCount` and
  `browserLongtaskCount` and update the completion plan before accepting
  nonzero browser tasks.
- Require the recording to contain a finish-line start marker. If the marker is
  missing, the report must fail or mark the result as incomplete rather than
  analyzing the whole recording as if it were the final scenario.
- Include the finish-line artifact path, analysis start timestamp, source kind,
  and all failure counters in the markdown report.
- Preserve the current guardrails for projection content work, retained budget
  misses, cold placeholders, true-hole publication, and held-previous overuse.

Acceptance criteria:

- Running the analyzer on a markerless recording returns nonzero with an
  explicit marker-missing failure.
- A report cannot pass with `longtaskCount > 0` unless the completion criteria
  have been explicitly changed in the plan.
- The previous failing baseline recording still fails for the original retained
  upload debt and long-task issues.

## Workstream 2: Remove Cold Placeholder Publication

The latest recording published one `publish-cold-placeholder`. The completion
plan only permits explicit cold-start behavior under actor contracts, and the
finish-line gate currently treats any retained cold placeholder as a failure.

Implementation targets:

- Identify the frame, surface, actor coverage state, and retained transaction
  path that produced the placeholder.
- Replace warm visible placeholder publication with one of:
  - exact coverage;
  - compatible previous coverage with a mechanical proof;
  - held previous with bounded age;
  - an explicit noninteractive cold-start contract that is excluded from the
    warm visible finish-line window.
- Ensure text/control placeholders remain noninteractive unless they carry a
  valid activation mapping.
- Add a focused unit test or Playwright assertion that a warm retained Settings
  surface cannot publish `publish-cold-placeholder`.

Acceptance criteria:

- `coldPlaceholderPublicationCount = 0` in the final report.
- No visible text/control actor is interactive while represented by a cold
  placeholder.
- Startup behavior is either covered before publication or explicitly outside
  the finish-line window.

## Workstream 3: Bound Held-Previous Age

The latest report found `236` held-previous over-budget samples. This means the
runtime is preserving continuity too long instead of repairing coverage or
publishing compatible projection inside the configured budget.

Implementation targets:

- Attribute every over-budget held-previous sample to surface id, transaction
  id, requested sample id, previous sample id, reason, and missing coverage.
- Separate true continuity holds from stale diagnostic accounting. If the same
  held transaction is counted repeatedly after it is no longer visible, fix the
  accounting instead of widening the budget.
- For real holds, prioritize visible repair for the blocking surface ahead of
  refinement, prefetch, cleanup, and passive diagnostics.
- Preserve compatible previous coverage when the proof succeeds rather than
  falling back to hold-previous.
- Make held-previous follow-up scheduling keep the correct lane debt queued
  until the blocking coverage is repaired or an explicit failure is reported.

Acceptance criteria:

- `heldPreviousOverBudgetCount = 0` in the final report.
- Max held-previous duration remains below `maxHeldPreviousMs`.
- No held-previous transaction pairs previous pixels with newer hit projection,
  DOM transforms, activation mapping, or debug identity.

## Workstream 4: Eliminate Retained Budget Misses

The latest report found `208` retained budget misses and `15`
budget-exhausted frames. The misses include startup `visible-repair` work and
later `visible-refinement` LOD work.

Implementation targets:

- Treat `budget-exhausted` and `deadline-exhausted` as unfinished debt, not a
  successful maintenance result.
- Enforce the hard per-frame retained maintenance deadline before raster,
  upload, atlas commit, queue traversal, and cleanup work begins.
- Split oversized first-visible repair into bounded slices unless the frame is
  explicitly before the finish-line marker.
- During active motion, allow only visible repair required to avoid a true hole.
  Defer `visible-refinement`, `prefetch`, and `cleanup`.
- During settling, drain refinement in bounded slices and yield before Chrome can
  report a long task.
- Add measured-cost estimates keyed by page size, LOD, command count, upload
  byte size, and recent actual duration.
- Record executed retained work items with lane, kind, priority, surface id,
  source rect, target LOD, content version, estimate, and actual cost.

Acceptance criteria:

- `retainedBudgetMissCount = 0`.
- `retainedBudgetExhaustedFrameCount = 0`.
- No interaction-active frame uploads retained work outside `visible-repair`.
- No retained maintenance phase overlaps a browser long task.

## Workstream 5: Cancel And Coalesce Stale Refinement

The latest budget misses include many `visible-refinement` `lod-refinement`
items around the same frame. That is the remaining stale/debt path from the
completion plan.

Implementation targets:

- Cancel queued refinement when the stable zoom bucket, content generation,
  source window, DPR, or projection horizon generation changes.
- Add a queue-generation guard so work produced for an older horizon cannot run
  after a newer sample makes it irrelevant.
- Prevent repeated enqueue loops that recreate compatible pages that already
  prove publishable coverage.
- Cap visible refinement and near-future work by surface priority and distance
  from the current projection horizon.
- Preserve compatible previous coverage while refinement is pending.

Acceptance criteria:

- Repeated settle windows do not upload the same surface/page generation unless
  content, source window, visual epoch, DPR, or LOD actually changed.
- Post-settle retained uploads stay below the configured window budget and trend
  to zero when the viewport stops changing.
- Refinement work cannot create a retained budget miss.

## Workstream 6: Remove Long Tasks

The latest report contains one GPU-attributed over-budget long task near
`retainedPageMaintenanceMs` and additional over-budget browser long tasks near
projection frames. Completion requires zero long tasks in the finish-line
window, or a documented criteria change before completion is claimed.

Implementation targets:

- Add missing marks around startup/prepublish retained maintenance and any
  browser-control projection work that can occur near long-task windows.
- Correlate long tasks with overlapping and nearby runtime measures, including
  retained page raster, upload, atlas commit, queue ordering/coalescing,
  eviction, DOM-control host assignment, and projection.
- Slice, defer, or cancel the phase that overlaps the GPU-attributed long task.
- Investigate the outside-GPU long tasks near projection frame `886`; if they
  are caused by host assignment churn or browser layout from GPU Flow DOM
  updates, move the work out of the interaction window or batch it safely.

Acceptance criteria:

- Final finish-line report summary has `longtaskCount = 0`.
- No GPU Flow runtime measure above the configured threshold overlaps a long
  task.
- If a browser long task remains after runtime work is removed, completion is
  not claimed until the Definition of Done is explicitly revised.

## Workstream 7: Re-Run The Full Verification Matrix

Run the focused tests, browser probes, and final recording from the same
worktree after the fixes above.

Required commands:

```sh
pnpm -C frontend exec vitest run src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/GpuFlow/domControlPlaneProjectionRuntime.test.tsx src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/retainedTextureUploadScheduler.test.ts src/gpuFlow/retainedVisibleCoveragePlanner.test.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-dom-control-observed-regressions.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-close-zoom-visual.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings
./scripts/quality/check.sh
```

Final evidence:

- Run the local Chrome recording flow for the retained Settings finish-line
  scenario.
- Run `./scripts/chrome_repro_gpuflow_finish_line_report.py --latest --markdown`.
- Attach the passing markdown report under `perf/reports/`.
- Include screenshots or Playwright visual evidence for before motion,
  during/after retained scroll, during/after zoom, and after settling.

## Definition Of Done

This remaining work is complete only when the latest finish-line report shows:

- `Status: PASS`;
- `longtaskCount = 0`;
- `coldPlaceholderPublicationCount = 0`;
- `heldPreviousOverBudgetCount = 0`;
- `interactionNonRepairUploadCount = 0`;
- `projectionContentWorkFrameCount = 0`;
- `retainedBudgetExhaustedFrameCount = 0`;
- `retainedBudgetMissCount = 0`;
- `postSettleUploadSpikeCount = 0`;
- `trueHolePublicationCount = 0`;
- no marker-missing or incomplete-recording failure;
- screenshots remain nonblank, readable, and aligned across the tested gestures.
