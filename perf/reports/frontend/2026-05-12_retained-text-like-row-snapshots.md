# Retained Text-Like Row Snapshots

Date: 2026-05-12
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan-full-scene-external-libraries @ 3c79b7787 plus active-editor wheel logging follow-up

## Goal

Replace the whole-section passive text-like preview pipeline with row-owned
browser-rendered snapshots, keep inactive CodeMirror-backed values visible
before click, and make retained section scrolling explicit while an active
editor is mounted.

## Scenario

- Entry point: `/settings`
- Project: settings project, All Settings view
- Browser: Chrome for Testing 150 with `CanvasDrawElement`, unsafe WebGPU, and
  WebGPU developer features for CDP verification
- Gestures covered: settings section scrolling, close zoom passive text checks,
  fast Ctrl+wheel zoom, CodeMirror activation, and active-editor wheel handoff

## Before

Source: Chrome repro recording `recording-20260512-211812`, captured before the
row snapshot refactor.

- 226 visible passive text-like rows were observed.
- At worst, 193 visible passive rows had no ready passive pixels and appeared
  blank.
- The passive preview maintenance queue reached 1,085 queued items and 1,092
  missing preview pages.
- Several clicked rows had zero passive coverage immediately before click,
  including `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__ListRoot__maxHeight`
  and `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__GlobalVariables__minWidth`.
- The recording included 24 frame-gap events and 16 long tasks.
- The largest frame gap was 241.6 ms after switching to All Settings.
- CodeMirror activation clicks produced 91-125 ms frame gaps.
- Wheel interactions produced 50-66 ms frame gaps.
- Retained page uploads totaled about 2.7 GiB, and every retained page upload
  frame was budget-exhausted in the summary.
- After activating
  `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__GlobalVariables__minWidth`,
  a 296-event wheel burst targeted the active CodeMirror DOM with `deltaY`
  around `+2312`, while the owning retained section stayed at scroll offset
  `1092` even though its max scroll offset was about `4781`.

## After

- Passive text-like controls now use row-scoped snapshot source DOM and row
  snapshot segments. The old whole-section preview source/page manager and
  project preview renderer were deleted.
- Retained content frame descriptors now carry text-like row snapshot segments
  with row/control/content/size/zoom identity, so one row's text snapshot does
  not invalidate unrelated rows.
- Active CodeMirror remains a DOM editor. Activation preserves passive row
  pixels until the editor overlay is mounted instead of making the canvas the
  text layout owner.
- Active editor wheel decisions now emit
  `gpu-flow-retained-active-editor-wheel-ownership` in Chrome repro logs with
  `editor-consume` versus `retained-section-handoff`, scroll metrics, deltas,
  and the active control id.
- `rg` over `frontend/src` and `frontend/tests` found no remaining references
  to the deleted `retainedTextLikePreview` path. The only remaining mentions are
  in the plan document that named the deleted files.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/retainedTextLikeRowSnapshotSources.test.ts src/gpuFlow/retainedContentFrameGeneration.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/interactions/retainedContentScroll.test.ts`
  - 4 files passed, 34 tests passed.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-codemirror-scroll.spec.ts`
  - 5 tests passed.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-codemirror-activation.spec.ts`
  - 3 tests passed.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-scroll-performance.spec.ts`
  - 1 test passed.
  - Guardrail includes a retained section wheel scroll frame sampler and asserts
    worst sampled frame interval is below 80 ms.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-interaction-stability.spec.ts -g "fast settings zoom remains visibly responsive"`
  - 1 test passed.
  - Guardrail asserts fast zoom p95 frame interval below 28 ms,
    slow-interval ratio below 0.18, and nonblank retained content after zoom.
- `./scripts/quality/check.sh`
  - Passed.

## CDP Visual Check

The row snapshot refactor was checked on `/settings` through Chrome DevTools
with the html-in-canvas/WebGPU flags enabled:

- Passive retained CodeMirror text was visible before click.
- `window.__settaGpuRetainedTextLikeSnapshotDebug` reported 401 mounted
  snapshot sources, 401 current snapshot sources, 401 snapshot content entries,
  and 0 active editors.
- The settings canvas was present and html-in-canvas support was enabled.

## Conclusion

The refactor removes the blank-prone whole-section passive preview dependency
and narrows text snapshot readiness to row-owned retained content. Automated
coverage now checks visible passive text, activation visual parity, active
editor wheel handoff, retained scroll stability, and fast zoom frame pacing.

No new manual Chrome repro bundle was captured during this agent pass. The
previous missing-preview-page burst fields are no longer part of the passive
text-like row path, and the new active-editor wheel ownership event is available
for the next user-driven recording.
