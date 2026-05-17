# GPU Flow Retained Settings Finish-Line Report

- Generated: 2026-05-20T00:51:58.312176+00:00
- Source: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260519-174527`
- Source kind: `chrome-repro`
- Analysis window: `finish-line-marker`
- Analysis start timestamp: `1779238292156.0`
- Incomplete recording: `False`
- Status: PASS

## Summary

- frameCount: `123`
- frameModes: `{'projection': 118, 'content': 5}`
- interactionActiveFrameCount: `123`
- longtaskCount: `0`
- projectionFrameCount: `118`
- retainedUploadCount: `1`
- retainedUploadedBytes: `1024512`
- runtimeMeasureCount: `395`
- transactionOutcomes: `{'none': 118, 'publish-exact': 5}`

## Budgets

- maxHeldPreviousMs: `120.0`
- maxLongTaskMs: `50.0`
- settleUploadBudgetBytes: `8388608`
- settleWindowMs: `1000.0`

## Failures

- browserLongTaskCount: `0`
- coldPlaceholderPublicationCount: `0`
- finishLineMarkerMissingCount: `0`
- finishLineWindowIncompleteCount: `0`
- gpuFlowLongTaskCount: `0`
- heldPreviousOverBudgetCount: `0`
- interactionNonRepairUploadCount: `0`
- longTaskCount: `0`
- missingPhaseProjectionFieldCount: `0`
- missingRetainedDiagnosticDetailCount: `0`
- postSettleUploadSpikeCount: `0`
- projectionContentWorkFrameCount: `0`
- retainedBudgetExhaustedFrameCount: `0`
- retainedBudgetMissCount: `0`
- trueHolePublicationCount: `0`

## Finish-Line Completeness

- contentFrameCount: `5`
- frameCount: `123`
- incomplete: `False`
- interactionActiveFrameCount: `123`
- missingReasons: `[]`
- projectionFrameCount: `118`

## Long Tasks

- none

## Outside-GPU Long Tasks

- none

## Runtime Measures

- committed-surface-frame-publication: `5`
- dom-control-projection: `243`
- projection-surface-resolve: `118`
- retained-display-transaction: `5`
- retained-page-atlas-commit: `1`
- retained-page-frame: `5`
- retained-page-raster: `1`
- retained-page-upload: `1`
- retained-prepublish-maintenance: `1`
- retained-runtime-frame: `5`
- retained-texture-eviction: `1`
- retained-visible-coverage-planning: `3`
- retained-visible-targets: `2`
- retained-work-queue-coalescing: `1`
- retained-work-queue-ordering: `2`
- retained-work-scheduler: `1`

## Retained Budget Misses

- none

## Post-Settle Retained Uploads

- start `1779238294581.0`: 0 bytes (0.0 MiB), 0 uploads

## Visual Evidence

- Evidence file: `perf/reports/gpu-flow-retained-settings-runtime-visual-evidence-20260519.json`
- Stages: `before-motion`, `during-zoom`, `after-zoom`, `during-retained-scroll`, `after-retained-scroll`, `after-settle`
- Each stage records visible retained row counts, sample row labels/rects, retained scroll offsets, viewport transform/interaction state, and the latest GPU frame modes/reasons.
- Chrome `Page.captureScreenshot` timed out in this recorder profile, so the retained visual evidence is the Playwright/CDP structured evidence captured from the live recording page.
