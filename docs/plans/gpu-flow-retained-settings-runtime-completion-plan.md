# GPU Flow Retained Settings Runtime Completion Plan

Date: 2026-05-19
Status: Implemented

## Goal

Finish the GPU Flow retained Settings runtime so the real browser recording,
focused Playwright probes, and visual checks all agree that the canvas is
smooth, coherent, and interactive.

Done means:

- viewport pan, zoom, and retained section scroll publish draw-only projection
  frames while motion is active;
- retained page maintenance is bounded, attributable, and unable to create
  browser long tasks;
- projected text/control actors remain readable, aligned, focusable when
  active, and nonblank during motion and settling;
- visible canvas pixels, DOM-control transforms, hit projection, activation
  mapping, and debug transaction identity come from the same committed surface
  frame and projection sample;
- no cold placeholder or true-hole state reaches a warm visible surface;
- the final recording has no unresolved visual/runtime issue and no hidden
  performance debt spike after gestures settle.

## Current Failure Snapshot

Latest Chrome repro recording inspected:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260519-052037`

Key observations from that recording:

- `1275` GPU-flow frames, `528` viewport frames, and `1056`
  interaction-active frames.
- Generic HTML-surface uploads are no longer the issue: `0` upload frames and
  `0` generic uploaded bytes.
- Retained page work is still too active: `143` retained page uploads,
  `189.263 MiB` uploaded, `128` retained upload budget-exhausted frames, and
  up to `34.162 MiB` uploaded in a single one-second post-settle window.
- Browser long tasks remain: `7` long-task entries, max `167 ms`.
- GPU frame duration is improved but not finished: p50 `0.6 ms`, p95
  `19.4 ms`, p99 `21.1 ms`, max `36.2 ms`.
- Retained transactions include `20` `hold-previous` outcomes from
  `coverage-missing` and one `publish-cold-placeholder` during startup.
- Top slow frames are mostly retained maintenance/content-publication frames,
  not projection frames.

The remaining problem is not the absence of a projection runtime. The runtime
exists. The remaining problem is that retained maintenance, coverage repair,
resolution refinement, diagnostics, and browser-control projection are not yet
strictly governed by a final observable quality gate.

## Non-Goals

- Do not replace GPU Flow with a DOM-rendered Settings page.
- Do not put text-like value pixels back into canvas-only drawing.
- Do not add another broad fallback path for missing retained coverage.
- Do not relax projection-frame tests so content work can hide inside motion.
- Do not treat a passing unit suite as sufficient without a browser recording
  and screenshot-level visual evidence.
- Do not update unrelated plans as part of this work.

## Workstream 1: Make The Failure Reproducible

Add a single finish-line recording report that can be run against the latest
Chrome repro bundle and against Playwright-generated samples.

Implementation targets:

- Extend or add a script under `scripts/` that reports:
  - long tasks with nearest GPU-flow frames and frame reasons;
  - projection diagnostics from nested `projectionDiagnostics`;
  - phase diagnostics from nested `phaseDiagnostics`;
  - retained upload bytes/counts by interaction span and settle window;
  - retained transaction outcomes and held-previous age;
  - cold placeholder and true-hole publication;
  - per-frame retained upload budget misses with work-item kind, priority,
    surface id, source rect, LOD, and content version.
- Make the report return nonzero when finish-line budgets fail.
- Persist before/after markdown reports under `perf/reports/`.

Acceptance criteria:

- The report fails on the latest inspected recording for retained upload debt
  and long tasks.
- The report attributes every long task to the nearest runtime phase or marks
  it explicitly as unattributed browser work.
- E2E performance snapshots and Chrome repro recordings expose the same
  projection/phase fields, even if one stores them nested and the other stores
  summaries.

## Workstream 2: Bound Retained Maintenance By Real Cost

Retained maintenance must use measured cost and explicit lane ownership. The
current scheduler often estimates raster/upload time as zero and only learns
after work has already run. That permits large retained upload bursts and
budget-exhausted frames.

Implementation targets:

- Teach retained page work estimates to use recent measured cost by page size,
  LOD, command count, and upload byte size instead of zero-time estimates.
- Enforce a hard per-frame deadline for retained maintenance using
  `performance.now()`, not only predicted work totals.
- Split retained work into:
  - `visible-repair`: only true visible holes or active pinned blockers;
  - `visible-refinement`: better LOD or freshness for already covered pixels;
  - `prefetch`: near-future/offscreen work;
  - `cleanup`: retired resources and cache pressure.
- During active viewport or retained-scroll motion, allow only visible repair
  required to avoid a true hole. Defer refinement, prefetch, and cleanup.
- During the settle window, drain work in bounded slices and yield before a
  long task is possible.
- Make budget-exhausted a debt signal, not a normal publish result. A
  budget-exhausted maintenance frame must request a follow-up but must not
  publish incomplete coverage as success.

Acceptance criteria:

- No retained maintenance frame exceeds its measured raster/upload deadline.
- No interaction-active frame uploads refinement or prefetch work.
- Outside cold startup visible repair, a retained frame uploads no more than
  the configured per-frame byte/upload budget.
- The final recording has no browser long tasks attributable to retained page
  raster, upload, queue traversal, atlas mutation, eviction, or cleanup.

## Workstream 3: Stop Stale Work From Reappearing

The recording still shows large retained uploads after gestures settle. Much of
that debt should be prevented, canceled, or coalesced before it reaches the
upload scheduler.

Implementation targets:

- Cancel obsolete LOD refinement whenever the stable zoom bucket changes or a
  newer content generation supersedes the queued item.
- Keep source-window work exact for first-visible repair, but avoid growing
  repeated visible/refinement unions into oversized uploads.
- Add a queue-generation guard so work produced for an older projection horizon
  cannot run after a newer sample makes it irrelevant.
- Prevent repeated enqueue loops where post-submit maintenance recreates the
  same compatible pages that already prove publishable coverage.
- Cap near-future work by surface priority and distance from the current
  projection horizon.
- Preserve previous compatible coverage while refinement is pending, rather
  than replacing it with cold or missing coverage.

Acceptance criteria:

- Repeated settle windows do not upload the same surface/page generation unless
  content, source window, visual epoch, DPR, or LOD actually changed.
- Post-settle retained uploads stay within a fixed per-window budget and trend
  to zero when the viewport stops changing.
- `hold-previous` transactions do not accumulate age beyond the configured
  visible continuity budget.

## Workstream 4: Prove Projection And DOM-Control Coherence Visually

Projected text/control actors must be verified as user-visible browser content,
not only as actor counts.

Implementation targets:

- Add a browser-level probe that samples visible retained text-like controls
  before motion, during retained scroll, after retained scroll, during zoom,
  and after settling.
- For each sampled actor, assert:
  - DOM-control host or snapshot coverage exists when text should be readable;
  - screen rect matches the retained row/control slot within tolerance;
  - projected transform uses the same transaction id as the canvas;
  - active/focused/composing controls stay live and do not downgrade;
  - passive controls are noninteractive unless explicitly activatable.
- Extend screenshot analysis to flag blank controls, duplicated columns,
  obvious misalignment, and placeholder bands.
- Capture failure screenshots under `tmp/` during development and final
  evidence under `perf/reports/`.

Acceptance criteria:

- Settings retained DOM-control observed regressions pass at desktop and a
  narrower viewport.
- All sampled visible text-like controls are readable and aligned across pan,
  zoom, retained scroll, and settle.
- A click resolves through the same visible transaction that drew the target.

## Workstream 5: Close Long-Task Attribution Gaps

The latest recording contains long tasks with browser attribution reported as
`unknown`. Completion requires either eliminating them or proving the owning
runtime phase.

Implementation targets:

- Add `performance.mark`/`measure` coverage around:
  - retained frame preparation;
  - visible coverage planning;
  - retained work queue ordering/coalescing;
  - retained page raster and upload;
  - texture atlas commits and evictions;
  - DOM-control host assignment and projection;
  - CodeMirror/DummyCodeMirror snapshot preparation;
  - committed surface frame publication;
  - React semantic snapshot publication.
- Teach the Chrome repro collector/report to correlate measures with long-task
  windows.
- Fix any phase that overlaps a long task by slicing, deferring, canceling, or
  moving it off the interaction/settle hot path.

Acceptance criteria:

- Final recording has zero long-task entries above `50 ms`.
- If Chrome still emits an unattributed long task, the report includes nearby
  runtime measures proving it is outside GPU Flow before completion is claimed.

## Workstream 6: Keep The Scheduler Honest

The publication scheduler should be validated through browser-observed
behavior, not only direct unit calls.

Implementation targets:

- Assert in Playwright that motion projection frames have:
  - `phaseDiagnostics.frameMode === "projection"`;
  - no retained runtime frame creation;
  - no retained page frame resolution;
  - no retained display transaction;
  - no retained maintenance;
  - no retained page raster/upload;
  - no generic texture upload;
  - motion-lane projection diagnostics.
- Assert that content and maintenance lanes never run while an unpresented
  motion sample is pending.
- Assert that a blocked publication keeps debt queued and requests follow-up.
- Assert that `idle` frames do not drain retained work.

Acceptance criteria:

- Projection-frame content-work guardrails pass in unit tests, Playwright
  probes, and the Chrome repro report.
- No mixed reason set can turn an active motion sample into a content
  publication frame.

## Workstream 7: Final Verification Matrix

Do not mark this work complete until all of these pass on the same worktree:

- Focused unit/runtime tests:
  - `pnpm -C frontend exec vitest run src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/GpuFlow/domControlPlaneProjectionRuntime.test.tsx src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/retainedTextureUploadScheduler.test.ts src/gpuFlow/retainedVisibleCoveragePlanner.test.ts`
- Focused Settings E2E:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-dom-control-observed-regressions.spec.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-close-zoom-visual.spec.ts`
- Full retained/GPU Settings shard:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings`
- Chrome repro recording:
  - run the local recording flow;
  - run the finish-line report against the latest artifact;
  - attach the passing markdown report under `perf/reports/`.
- Visual evidence:
  - CDP or Playwright screenshots for before motion, during/after retained
    scroll, during/after zoom, and after settle;
  - screenshot analysis reports no high-confidence placeholder, blank controls,
    or incoherent overlap.
- Repo quality:
  - `./scripts/quality/check.sh`
  - filtered TypeScript check proves no diagnostics in touched GPU Flow files
    if repository-wide typecheck is still blocked by unrelated errors.

## Definition Of Done

This work is complete only when the final report shows:

- `longtaskCount = 0`;
- no projection frame contains content, retained page, maintenance, or upload
  work;
- no interaction-active retained upload outside visible repair;
- no post-settle upload spike above the configured settle-window budget;
- no warm visible `publish-cold-placeholder`;
- no true-hole publication;
- held-previous age stays within the visible continuity budget;
- DOM-control and canvas transaction diagnostics match for every sampled
  visible frame;
- screenshots remain nonblank, readable, and aligned across the tested
  gestures.

## Suggested Execution Order

1. Add the finish-line recording report and make it fail on the latest artifact.
2. Add missing phase/long-task marks so failures are attributable.
3. Enforce measured retained maintenance budgets and lane restrictions.
4. Cancel stale retained queue work and prevent repeated refinement uploads.
5. Harden DOM-control visual/alignment probes.
6. Re-run the latest repro and iterate until the report passes.
7. Run the full verification matrix and add the final passing report.
