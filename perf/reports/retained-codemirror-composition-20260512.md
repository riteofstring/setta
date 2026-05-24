# Retained CodeMirror Composition - 2026-05-12

Date: 2026-05-12
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan-full-scene-external-libraries @ 00b762f16

## Goal

Fix retained CodeMirror active/passive visual mismatch and retained overflow
scroll drift without adding row-specific scroll heuristics.

## Scenario

- Entry point: `/settings`
- Project: settings project, `gui` retained section
- Browser: Chrome for Testing 150 with `CanvasDrawElement` and WebGPU flags
- User-visible checks:
  - activate `gui.maxZoom`
  - scroll the `gui` retained content overflow through the rows from the repro

## Before

- Passive CodeMirror previews were one late HTML overlay texture per visible
  text-like row.
- Active CodeMirror islands added a DOM-only shell, inset shadow, background,
  and padding not present in passive preview mode.
- No timing trace baseline was captured before this implementation pass.

## After

- Passive CodeMirror previews are one retained-surface-local preview page per
  retained content surface, sampled through the same retained texture source
  rect as the base content page.
- The `gui` retained surface now has one preview source instead of one source
  per visible text-like row.
- Active text-like controls no longer add the active-island background, inset
  shadow, or padding around the real CodeMirror editor.

## Focused Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/retainedTextLikePreviewSources.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/framePageOverlays.test.tsx`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-codemirror-activation.spec.ts frontend/tests/e2e/settings/settings-retained-codemirror-scroll.spec.ts --grep "retained settings text editor activation preserves|retained passive text editor previews"`
- CDP visual check on `/settings` with `gui.maxZoom` active and with retained
  `gui` overflow scrolled.

## Conclusion

- The row drift fix reduces preview source cardinality and composes previews in
  retained page coordinates instead of late world-space coordinates.
- A dedicated pan/zoom timing trace is still needed if we want a hard number for
  the performance regression the user noticed.
