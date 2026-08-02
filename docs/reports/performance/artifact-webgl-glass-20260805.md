# Artifact WebGL Glass

Date: 2026-08-05

## Scope

This report covers the artifact browser's mostly opaque optical-glass surface.
The change removes the browser and preview-card dot texture and decorative
gradient treatments, while retaining Setta's scene-responsive halftone and CRT
language beneath the document.

## Rendering shape

- The existing graph scene framebuffer and post pass remain the only scene
  texture and post-process pass. The glass does not add a canvas, framebuffer,
  blur pass, or CSS `backdrop-filter`.
- The dialog publishes its rounded CSS bounds only when layout changes. The
  canvas converts those bounds once and the frame loop receives stable numbers;
  it performs no DOM measurement.
- Only fragments inside that rounded rectangle take four additional diagonal
  texture samples. The normal graph path keeps its prior texture-read count.
- The original halftone remains the primary raster. Inside the glass, a
  low-strength wider phosphor cell and offset scanline phase modulate that
  raster, producing the requested subtle CRT-over-CRT result rather than a
  decorative dot grid.

## Focused measurement

The committed graph harness was extended with a profiler-only production-sized
glass toggle. A measurement workflow ran the same warmed graph scene once with
glass disabled and once with it enabled. It records results without asserting a
test threshold.

Environment:

| Field | Value |
| --- | --- |
| Runtime | Production Electron renderer build |
| GPU | Apple M2 via ANGLE Metal |
| Viewport | 1512×982 CSS pixels at DPR 2 |
| Scenario | `one-active-workstream` |
| Samples | 258 frames per recorded run, after one discarded warm-up run |

Results:

| Metric | Glass off | Glass on | Change |
| --- | ---: | ---: | ---: |
| CPU frame p95 | 0.20 ms | 0.20 ms | 0.00 ms |
| GPU frame p95 | 6.43 ms | 6.68 ms | +0.25 ms (+3.9%) |
| Frame delta p95 | 17.30 ms | 17.20 ms | -0.10 ms |
| Long tasks | 0 | 0 | 0 |
| Frames over dropped threshold | 0 | 0 | 0 |

The measurement artifact is under
`.recordings/director-graph-glass-profile/20260805T062721695Z/`. Chromium logged
no WebGL or shader diagnostics. Two unrelated controller-disposal messages were
emitted while the entry page navigated to the standalone harness; both precede
the recorded renderer runs.

For context, the earlier fullscreen fluid-field baseline in
`fullscreen-fluid-field-parity-20260730.md` reported a 5.92 ms GPU p95 at a
different 2560×1600/DPR 1 viewport. The same-build off/on comparison above is
the relevant glass cost because it holds the scene, surface sizes, hardware,
and process constant.

## Result

The optical treatment adds no main-thread cost or frame drops in the focused
profile. Its measured GPU p95 cost is 0.25 ms while preserving the existing
halftone and adding the second CRT layer only where the artifact surface is
visible.
