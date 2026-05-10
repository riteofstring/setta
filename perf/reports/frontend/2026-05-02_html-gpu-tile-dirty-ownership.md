# HTML GPU Tile Dirty Ownership

Date: 2026-05-02

## Scope

Completion-blocker follow-up for large interactive HTML GPU surfaces. The tiled
texture layout and tiled-flat renderer were already present; this pass moved
content dirtiness and upload accounting from whole tiled surfaces to tile-owned
dirty state where the owner has an explicit source rect.

## Change Under Test

- `HtmlSurfaceTextureManager.markSurfaceTextureDirty` now accepts a
  source-relative dirty rect and marks only intersecting tiled texture records
  dirty.
- `paint.changedElements` invalidation now carries descendant
  source-relative rects from the source DOM owner into the texture manager.
- Tiled content uploads now copy only dirty tiles and report uploaded/skipped
  bytes from dirty tile bytes rather than full surface bytes.
- Content-only tiled full-surface dirtiness is spent under `maxUploads` one tile
  at a time. Resolution/layout uploads remain atomic so new tiled layouts are
  not rendered with uninitialized tiles.

## Focused Verification

```bash
pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/textures.test.ts src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx --environment jsdom
```

Result: 3 files passed, 50 tests passed.

## Evidence

The new texture-manager tests verify:

- a dirty rect inside a six-tile surface uploads only `large-node:1:0`;
- uploaded bytes for that upload are one tile (`128 * 128 * 4`) instead of the
  full `300 * 200 * 4` surface;
- a full content dirty mark on the same tiled surface with `maxUploads: 2`
  uploads only the first two dirty tiles, leaves the surface queued, reports
  remaining dirty tile bytes, and finishes the remaining four tiles on the next
  upload pass.

The new paint-invalidation test verifies descendant paint changes are converted
to source-relative dirty rects before they reach the texture manager.
