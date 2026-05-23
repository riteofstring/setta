# GPU Flow Visible Frame Final Verification - 2026-05-23

Branch: `go-rewrite-canvas-html-gpu-surfaces-plan`

## Automated Verification

- `./scripts/quality/check.sh`
  - Passed for the current working-tree changes.
- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/visibleFrameContentPlan.test.ts src/gpuFlow/GpuFlow/visibleFramePresenter.test.ts src/gpuFlow/GpuFlow/visibleFrameTransactionProofs.test.ts src/gpuFlow/GpuFlow/visibleFrameTransactionPresentationEvidence.test.ts src/gpuFlow/GpuFlow/visibleFrameOutcomeChromeRepro.test.ts src/gpuFlow/GpuFlow/visibleFrameKernel.test.ts src/gpuFlow/GpuFlow/visibleFrameKernelHeldOutcomes.test.ts src/gpuFlow/GpuFlow/visibleFrameKernelBrowserVisualFault.test.ts src/gpuFlow/GpuFlow/visibleFrameKernelPhases.test.ts src/gpuFlow/GpuFlow/visibleFramePresentationProofsBehavior.test.ts src/gpuFlow/GpuFlow/visibleFramePresentationProofsBoundary.test.ts src/gpuFlow/GpuFlow/visibleFramePresentationTokenBoundary.test.ts src/gpuFlow/GpuFlow/visibleFrameProjectionWorkBoundary.test.ts src/gpuFlow/GpuFlow/visibleFrameProjectionTransaction.test.ts src/gpuFlow/GpuFlow/visibleFrameProjectionPlan.test.ts src/gpuFlow/GpuFlow/visibleFrameResourceRegistry.test.ts src/gpuFlow/GpuFlow/visibleFrameArchitecture.test.ts`
  - Passed: 17 files, 138 tests.
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts tests/e2e/settings/settings-retained-text-like-native-semantics-ime.spec.ts`
  - Passed: 3 tests.
  - Evidence logs: `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T//setta-e2e-logs-setta.go-rewrite-20260523-205247`.
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-retained-text-like-native-semantics.spec.ts`
  - Passed: 3 tests, including active-editor visual ink, runtime health, and single effective accessibility exposure before and after retained motion.
  - Evidence logs: `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T//setta-e2e-logs-setta.go-rewrite-20260523-204745`.
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`
  - Passed: 3 tests.
  - Evidence logs: `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T//setta-e2e-logs-setta.go-rewrite-20260523-205101`.
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-retained-visible-frame-coherence.spec.ts`
  - Passed: 4 tests.
  - Evidence logs: `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T//setta-e2e-logs-setta.go-rewrite-20260523-205153`.
- Full retained-subset command was attempted after the accessibility assertion and stopped in `settings-retained-user-recording-regressions.spec.ts` on the known Chrome repro parity mean-delta threshold (`19.83` observed vs `18` budget) after the scroll, IME, active-editor, and first user-recording tests passed. The same user-recording spec passed in isolation as listed above.
- `pnpm -C frontend exec tsc --noEmit --pretty false`
  - Failed on broad existing frontend TypeScript debt outside this visible-frame slice.
  - A filtered rerun found no errors mentioning `settings-retained-text-like-native-semantics`.

## Fresh Chrome Recording

- Recording: `recording-20260523-214021`
- Path: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260523-214021`
- Scenario: Chrome repro recorder with `CanvasDrawElement`, unsafe WebGPU, WebGPU developer features, disabled background throttling, and CDP attached on port 9241. CDP opened Settings, selected All Settings, settled `settings-section__shortcuts:param-content:unpinned` until 12 retained DOM controls were visible, posted one `finish-line-start` marker, dispatched two native CDP wheel events, posted one retained DOM-control visual-evidence trigger while 12 retained controls were still visible, and closed Chrome immediately after the visual-evidence window.

Recording stream summary:

- Bundle size: `535M` total; `app_state.ndjson` `49M`; `performance.ndjson` `112M`; `recording.json` `145M`.
- Console events: 4 debug, 2 info, 2 warn.
- Console/page errors: 0.
- Old blocked/held exception text occurrences: 0.
- Post-marker app-state window: 35 `gpu-flow-frame` entries, 35 `gpu-flow-visible-publication-outcome` entries, 2 retained content scroll flush entries, one `gpu-flow-retained-dom-controls` trigger, and one `gpu-flow-browser-visual-evidence` event.
- `scripts/chrome_repro_gpuflow_finish_line_report.py --latest --json`: passed with `failureCount: 0`.
  - Finish-line completeness: `frameCount: 35`, `projectionFrameCount: 35`, `interactionActiveFrameCount: 35`, `visualEvidenceWindow: true`, no missing reasons.
  - Long tasks: `0`.
  - Retained uploads after settle: `0` bytes.
  - Violations: no cold placeholders, true-hole publications, projection content work during motion, non-repair uploads during interaction, held-previous over-budget frames, retained budget misses, missing phase/projection fields, or visual-evidence blank text clips.
  - Visual evidence: one screenshot-backed event, `12` text clips, `pixelSourceCount: 1`, `screenshotCount: 1`, `blankTextClips: []`.

CDP visual check: done. The retained Settings page rendered with All Settings
selected, the retained rows debug surface exposed visible rows for
`settings-section__shortcuts:param-content:unpinned`, and the recorder captured
12 visible retained DOM controls with no cold-start shell.
