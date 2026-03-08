# SnapDOM Offline Reference

Fetched on `2026-03-07`.

This folder is a local reference bundle for evaluating SnapDOM as a possible inactive-preview renderer for Setta's `CodeParam` path. It is based on the official SnapDOM sources, summarized locally so we can continue working without web search.

## Official sources

- GitHub repo / README: `https://github.com/zumerlab/snapdom`
- Demo site: `https://snapdom.dev`
- Package page: `https://www.npmjs.com/package/@zumer/snapdom`

## What SnapDOM is

SnapDOM is a DOM capture engine. It captures a DOM subtree into a self-contained representation and can export it as:

- `SVG`
- `PNG`
- `JPG`
- `WebP`
- `canvas`
- `Blob`

The README positions it as:

- modular and extensible
- fast relative to `html2canvas` / `html-to-image`
- based on standard Web APIs
- able to embed styles, pseudo-elements, and fonts
- able to handle same-origin iframes

## Installation

Stable package:

```bash
npm i @zumer/snapdom
```

Dev package:

```bash
npm i @zumer/snapdom@dev
```

Bundled ESM usage:

```ts
import { snapdom } from "@zumer/snapdom";
```

## Basic API

Reusable capture:

```ts
const result = await snapdom(element);
```

Returned export surface includes:

- `toRaw()`
- `toSvg()`
- `toCanvas()`
- `toBlob(options?)`
- `toPng(options?)`
- `toJpg(options?)`
- `toWebp(options?)`
- `download(options?)`

One-step helpers also exist:

- `snapdom.toSvg(el, options?)`
- `snapdom.toCanvas(el, options?)`
- `snapdom.toBlob(el, options?)`
- `snapdom.toPng(el, options?)`
- `snapdom.toJpg(el, options?)`
- `snapdom.toWebp(el, options?)`
- `snapdom.download(el, options?)`

## Options relevant to Setta

### Output choice

For our inactive code-preview experiment, the most relevant outputs are:

- `toSvg()`
  Best first candidate if we want crisp scaling while zooming.
- `toCanvas()`
  Best first candidate if we want a single painted surface and are willing to manage raster scaling tradeoffs.

### Cache control

SnapDOM documents an internal cache mode:

- `"disabled"`: no cache
- `"soft"`: clears session caches; documented default
- `"auto"`: minimal cleanup
- `"full"`: keep everything in memory for maximum performance

This is highly relevant if we snapshot many repeated code-preview shapes and want to avoid paying the full capture cost every time.

### Fonts

Documented font-related controls:

- `embedFonts`
- `localFonts`
- `iconFonts`
- `excludeFonts`

This matters for us because code previews need to stay visually close to the current monospace text rendering.

### Cross-origin assets

The README calls out `useProxy` for CORS-denied external images / fonts.

This probably matters less for our code-preview use case than it would for full arbitrary section snapshots, but it is still relevant if a future capture includes remote fonts or media.

### Root-output shaping

Documented options:

- `outerTransforms`
- `outerShadows`

These can flatten transforms or tighten bounding boxes. They may be useful if we snapshot a code preview subtree and want a stricter output box with less visual bleed.

## Plugins

SnapDOM documents a plugin system with lifecycle hooks such as:

- `beforeSnap`
- `beforeClone`
- `afterClone`
- `beforeRender`
- `afterRender`
- `beforeExport`
- `afterExport`
- `defineExports`
- `afterSnap`

Why this matters for us:

- We could inject a capture-only overlay or wrapper into the cloned subtree.
- We could add a custom export path if the stock outputs are close but not enough.
- We could potentially strip unneeded capture-time visuals from the cloned subtree without touching the live DOM.

The README explicitly says clone-only visual changes avoid flicker in the live DOM.

## Limitations called out upstream

The README explicitly notes:

- external images need CORS access, or `useProxy`
- Safari may fall back from WebP to PNG
- `@font-face` is well supported, but JS `FontFace()` may need a workaround

## Benchmarks called out upstream

The README includes Chromium benchmark tables comparing SnapDOM against older SnapDOM, `html2canvas`, and `html-to-image`.

The most relevant claim for our use case is that capture time scales much better than the comparison libraries on larger / more complex inputs. The README's complex-element table reports, for example:

- around `17.5 ms` for a `1200x800` complex view
- around `54.0 ms` for a `2000x1500` complex view
- around `171.4 ms` for a `4000x2000` complex view

These are upstream benchmark claims, not our measurements.

## Setta-specific read of suitability

SnapDOM looks promising for one narrow purpose:

- render a real inactive code-preview subtree once
- snapshot it into a single exported surface
- replace the ongoing live highlighted DOM with that single surface during pan/zoom

Why it is interesting for us:

- It may preserve the current look better than a custom renderer.
- It gives us both `SVG` and `canvas` paths to test.
- It attacks the likely bottleneck: ongoing transform/paint cost of many DOM/text nodes.

Main risk:

- If we eagerly capture hundreds of previews at once, we may move the hitch from pan-time to capture-time.

## Recommended prototype order

If we decide to test SnapDOM, the lowest-risk order is:

1. Capture a single inactive `CodeParam` preview subtree to `SVG`.
2. Compare visual fidelity against the current DOM preview.
3. Measure one-time capture cost.
4. Measure pan/zoom FPS after replacing the live preview DOM with the captured surface.
5. Only then test bulk caching / pre-generation strategies.
