# GPU Flow Retained Content Lifecycle Implementation Report

Date: 2026-05-15

## Scope

Implemented the retained content lifecycle compositor refactor from
`docs/plans/gpu-flow-retained-content-lifecycle-compositor-refactor-plan.md`.
The new retained compositor separates motion, semantic content compatibility,
fidelity refinement, and true holes. It removes the old pending-strip
publication model as an authoritative path.

## Baseline

- Baseline report:
  `perf/reports/frontend/2026-05-15_gpu-flow-retained-content-lifecycle-baseline.md`
- Failing-first visual guard reproduced the old horizontal placeholder-band
  failure before compositor changes.
- Baseline screenshots showed 7-8 repeated horizontal placeholder bands with
  dominant coverage around 0.96-0.98 and regular spacing ratio 1.

## Implementation Summary

- Added retained lifecycle ownership in
  `frontend/src/gpuFlow/retainedContentLifecycle.ts`:
  semantic identity, compatibility results, fidelity state, content snapshots,
  and content-to-texture mapping proof.
- Updated committed retained texture pages to carry lifecycle proof and added
  exact, compatible, and rejected coverage lookups.
- Refactored `retainedTexturePageGrid.ts` so the planner owns exact draw quads,
  compatible draw quads, true-hole rects, refinement descriptors, rejected
  stale rects, protected page keys, and fidelity state.
- Rewired display composition and diagnostics around `coverageReadiness`,
  `fidelityReadiness`, `trueHoleRects`, `compatibleDrawQuadCount`, and
  `rejectedStaleRectCount`.
- Replaced repeated pending-strip visuals with quiet true-hole background
  visuals that are only sourced from `trueHoleRects`.
- Kept compatible retained pages drawable during zoom/refinement backlog and
  protected old compatible pages until replacement coverage exists.
- Split active text-like/native island freshness from broad section invalidation
  so one row click does not invalidate unrelated retained pages.
- Added retained section scroll interaction state to avoid upload/refinement
  work competing with active retained wheel motion.
- Updated Chrome repro events and frame performance metrics to report the new
  coverage/fidelity model.

## Verification

All commands below passed on the final code state unless noted.

| Command | Result |
| --- | --- |
| `./scripts/quality/check.sh` | Passed |
| `pnpm -C frontend exec vitest run src/gpuFlow` | 114 files, 737 tests passed |
| `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface` | 27 files, 157 tests passed. Vitest printed existing `--localstorage-file` path warnings. |
| `pnpm -C frontend exec vitest run src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts` | 2 files, 9 tests passed |
| Focused retained scheduler/page-manager regression run | 3 files, 36 tests passed |
| Retained Settings Playwright batch | 37/37 passed in 3.3m |

The final retained Settings Playwright batch covered cadence, visual
regressions, close zoom, switch zoom flash, pan/zoom performance, large-scene
performance, CodeMirror activation/scroll, retained interactions, retained
scroll performance, interaction stability, scroll continuity, zoom-click visual
continuity, pan ownership, and retained text-like row rendering.

## Performance Evidence

Final sample file:
`perf/reports/frontend/2026-05-15_gpu-flow-retained-content-lifecycle-final-samples-post-scheduler.jsonl`

Large-scene All Settings run:

- Scene: 46 nodes, 45 retained surfaces, 476 retained rows.
- Gesture frame p95:
  - pan: 9.3 ms
  - viewport zoom: 9.1 ms
  - retained-hover zoom: 9.2 ms
  - retained section scroll: 16.7 ms
  - mixed scroll plus retained-hover zoom: 9.4 ms
- Long tasks in the large-scene gesture samples: 0.
- Placeholder band analysis:
  - before, after pan, after zoom, after retained-hover zoom, after retained
    scroll, and after mixed interaction all had `bandCount: 0` and
    `highConfidencePlaceholder: false`.
- The run used refresh-aware `ci-capped` budgets, so it proves near-cadence
  continuity in this environment but does not close the residual risk for a
  strict 120 Hz hardware/browser pass.

Scroll continuity visual samplers passed their motion assertions. Their JSONL
entries include long tasks from screenshot/canvas analysis instrumentation; the
large-scene performance run is the primary long-task gate and recorded 0 long
tasks.

## Chrome Recording

Final Chrome recording:
`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260515-183350`

Recording summary:

- Fresh final-state recording after scheduler budget cleanup.
- Event count: 492.
- GPU-flow frames: 75.
- Viewport frames: 65.
- Interaction-active frames: 54.
- Scene reached 46 nodes and 476 retained rows during the automated Settings
  repro.
- Retained page uploads: 16 pages, 31.67 MiB.
- Retained page raster p95: 1.85 ms; upload p95: 1.275 ms.
- Old pending/missing-page summary: max missing page count 0.
- Retained display diagnostics recorded 2 `initial-loading` frames and 73
  `true-holes` frames during cold load/refinement. Max cold true-hole area was
  7,552,684.8 CSS px, max exact page count was 13, max compatible page count
  was 0, and max refinement page count was 90.
- Rejected stale rects and semantic compatibility rejection reasons in the
  recording: none.
- Chrome recording frame duration p95 was 31.93 ms, max 126.2 ms. Long task
  count was 13 with max 894 ms during cold app load and recorder automation, so
  the warmed Playwright large-scene run above is the performance acceptance
  evidence.

## CDP Visual Check

Chrome DevTools MCP visual check:

- Opened `http://127.0.0.1:3019/settings`.
- Centered `settings-section__shortcuts:param-content:unpinned`.
- Observed 46 nodes, 476 retained rows, and 15 visible rows for the centered
  retained surface.
- Screenshot artifact:
  `perf/reports/frontend/2026-05-15_gpu-flow-retained-content-lifecycle-cdp-visual.png`

## Plan Audit

- Step 1 and 2: failing-first browser guard and append-only baseline report
  added before behavior changes.
- Step 3 to 5: lifecycle types, semantic identity, compatibility predicate, and
  content-coordinate mapping proof implemented in one owner module and carried
  by committed pages.
- Step 6 to 8: cache, planner, and display composer now distinguish exact
  coverage, compatible coverage, refinement targets, rejected stale rects, and
  true holes.
- Step 9: pending strips removed from normal publication; true-hole visuals
  are quiet and non-patterned.
- Step 10: zoom bucket changes are refinement work while compatible content
  remains drawable.
- Step 11: native island freshness is scoped to the active row and avoids
  unrelated section invalidation.
- Step 12: retained interaction state and work-class budget accounting bound
  visible refinement and prefetch work during interaction without a
  categorical no-refinement rule.
- Step 13: Chrome repro and frame performance diagnostics report
  coverage/fidelity fields and obsolete pending-strip fields are removed.
- Step 14: focused unit coverage updated for compatibility, coverage proof,
  true-hole display, diagnostics, frame metrics, and retained interaction
  state.
- Step 15: required Vitest, retained Settings Playwright, Chrome recording,
  CDP visual check, and quality gate were run.

Obsolete model audit:

- `rg` found no remaining matches under `frontend/src/gpuFlow` and retained
  Settings E2E tests for:
  `pendingStrip`, `pending-strip`, `textureReadiness`,
  `publish-motion-frame-with-pending-strips`, `explicit-loading-state`,
  `pending-visible-strips`, `fallbackPageCount`, `fallbackRects`,
  `pendingArea`, `maxConsecutivePending`, `RetainedPendingStrip`,
  `PublishedRetainedFallbackPage`, or `scrollPublicationMode`.

## Residual Risk

- The final automated performance evidence ran under refresh-aware capped
  budgets, not a strict confirmed 120 Hz local browser run. The large-scene
  p95 values are near display cadence and visual continuity passed, but a
  dedicated 120 Hz hardware/browser pass remains the only way to fully close
  the strict 8.33 ms target.
- Chrome recording diagnostics include cold-load and automation long tasks.
  Those are tracked separately from the warmed large-scene performance gate.
