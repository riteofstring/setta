# Fullscreen Fluid Field Parity

Date: 2026-07-30

## Scope

This is the focused before/after record for restoring the production Director
graph's ambient particle field to the implementation in
`docs/mockups/fullscreen_conversation_concept.html`.

The comparison covers the field shader and seed data, its animation clock,
camera-wheel response, node-relative field halos, post-process values, and the
cost of the field at the fullscreen size in the latest desktop recording.

## Baseline

The latest recording, `.recordings/20260730T040838Z`, captured the app at
2560×1600. The prior implementation diverged from the mockup in several
material ways:

- It scaled the mockup's fixed 5,200 particles by viewport area. At 2560×1600,
  the area scale quantized to 4, so the renderer submitted 20,800 field
  particles per frame.
- It based field time on the first semantic render timestamp. The recording's
  first motion heartbeat reported `fieldTimeSeconds: 35572.003`, rather than
  the small elapsed animation clock used by the mockup.
- It weakened the reference chromatic offset from `0.012` to `0.0045`, raised
  the minimum dither cell from `1.6` to `3`, and omitted the mockup's recency
  contribution from field-halo radii.
- Its wheel listener was attached only to the canvas, so foreground UI could
  prevent a wheel gesture from driving the field's camera parallax.

## After

The renderer now uses the mockup's four-scalar field buffer layout, Mulberry32
seed `4242`, fixed 5,200-particle count, fluid mode, cyan/violet colors, shader
math, point sizing, alpha, post-process chromatic offset, and dither floor.
Field time is an elapsed frame-delta accumulator, matching the mockup's
`growT += dt` behavior without inheriting persisted conversation timestamps.
Wheel input is observed at the window boundary.

At the recorded fullscreen size, fixing the count reduces ambient field vertex
work from 20,800 to 5,200 particles per frame, a 75% reduction.

## Manual Renderer Measurement

Environment:

| Field | Value |
| --- | --- |
| Runtime | Disposable Electron renderer over the current Vite source |
| GPU | Apple M2 via ANGLE Metal |
| Viewport | 2560×1600 CSS pixels at DPR 1 |
| Scenario | `one-active-workstream` |
| Quality | Full tier, render scale 1 |
| Duration | 2,500 ms, 146 frames |

Results:

| Metric | Result |
| --- | ---: |
| CPU frame p95 / p99 / max | 0.20 / 0.40 / 0.80 ms |
| GPU frame p95 / p99 / max | 5.92 / 6.93 / 8.90 ms |
| Frame delta p95 / p99 / max | 17.30 / 17.60 / 17.70 ms |
| Long tasks | 0 |
| Frames over dropped threshold | 0 |
| Quality-tier changes | 0 |
| Minimum render scale | 1 |
| Pixel check | Passed |

Two app frames captured one second apart produced a normalized RMSE of
`0.00853347` after a 4 px blur over the central field crop. The blur suppresses
frame grain, so the remaining difference confirms structural fluid-field
motion rather than post-process noise alone.

A separate input probe placed a full-window foreground element above the
canvas, dispatched a wheel gesture through it, and observed a 180 px graph
translation. This confirms scroll-driven camera parallax continues to work
when the pointer is over app UI rather than the canvas itself.

## Result

The production ambient field now follows the reference implementation while
remaining within the full-quality frame budget at the recorded fullscreen
size.
