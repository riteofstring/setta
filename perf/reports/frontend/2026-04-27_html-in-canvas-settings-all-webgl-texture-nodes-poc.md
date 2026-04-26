# HTML-in-Canvas WebGL Texture Nodes POC

Date: 2026-04-27
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree
Related PR: n/a

## Goal

Check whether the Settings All Settings CanvasFlow view can use the HTML-in-Canvas WebGL texture path for full-fidelity cached node rendering.

## Method

- Browser: Playwright Chrome with `--enable-blink-features=CanvasDrawElement`.
- API probe:
  - `WebGLRenderingContext.texElementImage2D` is exposed.
  - Uploading an HTML-in-canvas child works only from the same `layoutsubtree` canvas's WebGL context.
  - Uploading that child from a different canvas's WebGL context throws `TypeError`.
- App POC:
  - Added a local `webgl-texture-nodes` renderer in the working tree.
  - The renderer selected a WebGL context for the existing `layoutsubtree` canvas, uploaded visible node elements with `texElementImage2D`, drew textured quads, and applied computed CSS transforms for DOM hit testing.

## Result

The WebGL renderer did not produce a usable perf run.

Observed failures:

- Installing the WebGL renderer before the default project bootstrap caused Chromium to crash while navigating to the default sample project.
- Bootstrapping normally, then installing the WebGL renderer before navigating to `/settings`, left the page unresponsive before `.canvas-flow__canvas` appeared. The harness could not even read `<body>` text after the timeout.

## Decision

- Do not keep the WebGL renderer code in the branch yet. A perf flag that hangs or crashes Chromium is not useful.
- The WebGL API surface exists, but `texElementImage2D` is not currently mount-safe against our real app node tree.
- Treat WebGL texture rendering as blocked until isolated outside the app with progressively richer node DOM:
  1. one simple direct canvas child
  2. one `SectionContainer`-shaped card
  3. one real Settings node body
  4. the full Settings All Settings view

## Related Result

The Canvas2D world-transform variant did run. It improved zoom FPS from roughly `73 FPS` to `81 FPS`, but remained far below the `rect-nodes` ceiling around `117 FPS`.
