# Retained Text-Like Row Textures - 2026-05-12

Date: 2026-05-12
Area: frontend
Code paths:

- `frontend/src/gpuFlow/retainedTextLikeRowTextureManager.ts`
- `frontend/src/gpuFlow/retainedTextLikeRowTextureVisuals.ts`
- `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`
- `frontend/src/gpuFlow/interactions/panZoom.ts`

## Goal

Decouple passive CodeMirror/text-like value pixels from retained content page
readiness so pan/zoom and section scrolling can keep drawing committed row text
while sharper or updated row snapshots are prepared.

## Scenario

- Entry point: `/settings`
- View: All Settings retained scene
- Baseline recording: `recording-20260512-224054`
- Browser verification: Chrome DevTools check against a temp workspace on
  `http://127.0.0.1:59036/settings`

## Before

The failed recording showed the partial row snapshot implementation was still
page-coupled:

- max `blankPassiveRowCount`: 358 of 401 passive rows
- max `missingPassiveRowCount`: 361 of 401 passive rows
- final `blankPassiveRowCount`: 120 of 378 passive rows
- retained uploads: about 2.66 GiB
- retained page uploads: 3,225
- retained frames with page budget exhaustion: 1,067
- max retained missing page count: 590
- max frame gap: 258.3 ms
- long tasks over 50 ms: 20, max 192 ms

## After

This implementation slice changes the rendering architecture rather than
claiming final performance numbers:

- Passive text-like value pixels now use row-owned committed textures instead
  of retained content page patches.
- Retained content pages continue to draw non-text row chrome and controls.
- Row text texture uploads have a separate budget and memory cache.
- Row text texture uploads use a tighter budget while viewport interaction is
  active, so existing committed text can keep compositing during pan/zoom.
- The compositor draws row text as late flat surfaces over retained row chrome.
- Wheel-driven pan/zoom viewport updates are coalesced through
  `requestAnimationFrame` instead of applying every intermediate wheel delta
  synchronously.
- Chrome DevTools visual check on All Settings exposed 226
  `retained-text-like-row-snapshot:*` late flat row texture surfaces, with 163
  intersecting the viewport at the checked zoom/scroll position.

## After Recording Recheck

After recording: `recording-20260512-234457`

Compared with `recording-20260512-224054`:

- final `blankPassiveRowCount`: 120 -> 0
- final `missingPassiveRowCount`: 137 -> 0
- max visible row texture catch-up blank/missing count: 193 during startup or
  fast scene exposure; not persistent by the final frame
- retained uploads: about 2.66 GiB -> about 275 MiB
- retained page uploads: 3,225 -> 375
- retained page budget-exhausted frames: 1,067 -> 93
- max retained missing page count: 590 -> 332
- row-owned text texture uploads: about 304 MiB across 1,730 row uploads
- row-owned text texture budget-exhausted frames: 44
- active-editor wheel ownership events: 0 -> 1

Whole-recording timing metrics still include page load/setup and are therefore
not a clean gesture-only comparison:

- frame-gap events: 24 -> 15
- max frame gap: 258.3 ms -> 266.7 ms
- long tasks over 50 ms: 20 -> 16
- max long task: 192 ms -> 242 ms
- `gpu-flow-frame` p95/p99/max: 8.9/10.6/23.5 ms -> 12.8/15.3/21.6 ms

Interpretation:

- The persistent passive value disappearance from the failed recording is fixed
  in this automated recheck.
- Retained page upload churn is no longer in the multi-GiB class because
  passive text-like value pixels are no longer patched into retained pages.
- Row-owned texture uploads are now the relevant text-rendering budget to watch.
  They are explicit and separate from retained page uploads.
- Gesture-window responsiveness should be tracked with the targeted Playwright
  interaction test, not whole-recording load/setup totals. That test now keeps
  long-task counts in diagnostics while using calibrated frame-sampling
  assertions for pass/fail.

## Post-Coalescing Recording Recheck

After recording: `recording-current` from
`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-auto-record-root-8aF22A/recording-current`

This recording was captured after the pan/zoom `requestAnimationFrame`
coalescing and active-interaction row-upload budget changes, using an automated
CDP All Settings pan/zoom repro.

- final `blankPassiveRowCount`: 0
- final `missingPassiveRowCount`: 0
- max visible row texture catch-up blank/missing count: 193 during scene
  exposure; not persistent by the final frame
- retained uploads: about 33 MiB
- retained page uploads: 90
- retained page budget-exhausted frames: 23
- max retained missing page count: 80
- row-owned text texture uploads: about 30 MiB across 46 row texture upload
  diagnostics
- row texture memory max allocation: about 30 MiB
- retained uploads after the settle window: 0
- row texture uploads after the settle window: about 0.66 MiB
- viewport interaction span: 659 ms across 22 frames
- `gpu-flow-frame` p95/p99/max: 15.23/29.75/43.9 ms, with the max frame
  occurring on initialization

Interpretation:

- The post-coalescing recording keeps the key user-visible fix intact: passive
  text does not remain blank by the final frame.
- Retained page upload churn is now far below the multi-GiB failure mode from
  `recording-20260512-224054`.
- The remaining catch-up behavior is row texture work, which is bounded and
  separated from retained page uploads.
- Whole-recording long tasks still include load/setup; the targeted Playwright
  gesture test remains the pass/fail guardrail for responsiveness.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/retainedTextLikeRowTextureManager.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/retainedContentFrameGeneration.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.retainedControls.test.ts src/gpuFlow/retainedContentRuntimeState.test.ts src/gpuFlow/interactions/panZoom.test.ts`
- Changed-file TypeScript scan for touched retained row texture, retained
  runtime, project GPU surface, pan/zoom, and E2E files.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-interaction-stability.spec.ts -g "fast settings zoom remains visibly responsive"`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts -g "all-settings retained section wheel scrolling does not refill the texture backlog"`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-codemirror-passive-visibility-regression.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-codemirror-scroll.spec.ts -g "retained active text editor wheel input scrolls"`
- `./scripts/quality/check.sh`
- `git diff --check`
- CDP visual check on `/settings` All Settings: row-owned late flat surfaces were present and no new console errors were observed.
- Post-coalescing Chrome recording recheck captured with automated CDP pan/zoom
  in All Settings.

## Remaining Measurement Watchpoints

Future measurements should keep focusing on gesture-window-only timing for
pan/zoom and section scroll. The remaining performance question is whether row
texture catch-up can be further smoothed; the old persistent passive blanking
and multi-GiB retained-page upload failure modes no longer reproduce in either
`recording-20260512-234457` or the post-coalescing `recording-current` recheck.
