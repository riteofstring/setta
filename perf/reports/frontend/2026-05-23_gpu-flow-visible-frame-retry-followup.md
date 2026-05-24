# GPU Flow Visible Frame Retry Follow-up

Date: 2026-05-23

Scope: follow-up verification for `docs/plans/gpu-flow-coherent-visible-frame-engine-plan.md` after throttling retry paths that were re-running rejected held-previous/browser-visual candidates during retained Settings motion.

## Changes verified

- Browser-visual blocked content debt now stays queued without an immediate manual retry.
- Retained follow-up frame requests are suppressed for held-previous-budget blocked outcomes.
- Content retries are deferred after content/maintenance held-previous budget blocks, while idle blocked frames no longer extend the cooldown.
- Motion retries are deferred separately after motion held-previous budget blocks, allowing content/maintenance debt to rebuild retained coverage instead of retrying blocked motion indefinitely.

## Automated verification

- `pnpm -C frontend exec vitest run src/gpuFlow/projectionSchedulerRetry.test.ts src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/visibleFramePresentationProofsBehavior.test.ts`
- `./scripts/quality/check.sh --files frontend/src/gpuFlow/projectionScheduler.ts frontend/src/gpuFlow/projectionSchedulerRetry.test.ts`
- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/projectionSchedulerRetry.test.ts src/gpuFlow/committedSurfaceRuntime.test.ts src/gpuFlow/htmlSurfaces/texturesBudgetEviction.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-visible-frame-coherence.spec.ts frontend/tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts frontend/tests/e2e/settings/settings-retained-text-like-native-semantics.spec.ts frontend/tests/e2e/settings/settings-retained-text-like-native-semantics-ime.spec.ts`

## Chrome recording evidence

Last valid finish-line source:

`/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260523-150651`

The finish-line window used `finish-line-start` after opening All Settings, waiting for retained rows/coherent frame, centering the shortcuts retained surface, and allowing an 800 ms warmup settle. The end marker used `start` after the retained scroll burst, section recenter, second scroll burst, viewport pan/zoom, and a 350 ms post-gesture wait.

Marker window:

| Metric | Result |
| --- | ---: |
| Console/page errors | 0 |
| Old blocked/held committed-surface errors | 0 |
| Long tasks over 50 ms | 0 |
| Max long task | 50 ms |
| Frame gaps over 50 ms | 0 |
| Active-interaction frame gaps over 50 ms | 0 |
| Max active-interaction frame gap | 50 ms |
| Slowest `surface-frame` measure | 49.9 ms |
| Slowest content-publication measure | 49.5 ms |

Application outcomes in the marker window:

- `hold-previous|idle|motion-settling`: 1
- `commit|motion|motion-active`: 1
- `hold-previous|motion|motion-active`: 3
- `blocked|content|content-catchup`: 1
- `blocked|motion|motion-active`: 30

Whole-recording long tasks remain dominated by pre-marker All Settings/view warmup and post-marker content debt drain. Those windows are intentionally excluded from the retained scroll/viewport finish-line window above.

Post-split CDP-driven recorder attempts (`recording-20260523-153901` and `recording-20260523-154056`) emitted the finish-line markers but no GPU Flow frame/outcome events after the marker because the synthetic wheel automation did not exercise the renderer publication path. Those bundles are excluded from the finish-line evidence; the post-split browser coverage is the retained Settings Playwright suite listed above.
