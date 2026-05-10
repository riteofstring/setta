# HTML Surface Display List Composition Plan

## Goal

Make HTML-in-canvas composition deterministic so retained section content cannot
disappear, reset, or become non-interactive because a neighboring texture
changes resolution or storage layout.

Texture layout is an implementation detail. A surface moving from a single
texture to tiled textures must not change its visual stacking, input ownership,
or ability to cover retained content.

This is a replacement plan, not a compatibility plan. Do not add legacy support,
dual paths, old-field aliases, transitional adapters, feature flags for old/new
rendering behavior, or silent fallbacks. Replace the current pass-partitioned
composition model and delete the old ownership once the replacement is verified.

## Current Evidence

The latest Chrome recording analyzed for this plan is:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260510-211223`

The recording points to a composition problem, not a missing retained texture
problem.

- 901 GPU-flow frames were recorded.
- Zoom ranged from `0.1` to `4.5`.
- Every frame at zoom `>= 4` reported `retainedTexturePageMissingPageCount: 0`.
- Retained texture pages still churned heavily: about `1.085 GiB` uploaded
  across 1,237 retained page uploads.
- Generic HTML uploads also continued at high zoom: about `292 MiB` total.
- High-zoom generic uploads were dominated by `settings-section__gui` and
  `settings-section__shortcuts`.
- Those section surfaces switched through resolution uploads and tiled layouts
  near the high-zoom disappearance.
- Browser console output did not show WebGPU/device errors.

The important clue is that retained pages existed while content disappeared.
That means the page cache likely had drawable content, but composition allowed
another surface to draw over it or allowed a visual snapshot to be sampled with
the wrong ownership.

## Existing Code Problems

- `frontend/src/gpuFlow/retainedTexturePageVisuals.ts` converts retained page
  quads into ordinary `HtmlSurfaceFlatVisual` records.
- `frontend/src/gpuFlow/htmlSurfaces/frameVisualScene.ts` appends retained page
  visuals to `flatSurfaces`, while generic tiled section surfaces remain in
  `tiledFlatSurfaces`.
- `frontend/src/gpuFlow/htmlSurfaces/renderer.ts` draws all flat surfaces before
  all tiled flat surfaces. This global pass order ignores intended visual
  ownership across the two arrays.
- `frontend/src/gpuFlow/htmlSurfaces/surfaceVisuals.ts` makes `single` vs
  `tiled` texture layout decide which renderer pass owns a visual.
- `zIndex` is carried in visual records and geometry caches, but the flat shader
  renders at one depth and draw order is still determined by pass execution and
  array order.
- Section textures such as `settings-section__gui` can still represent broad
  section chrome/body pixels. If one of those surfaces is drawn after retained
  content, it can cover the retained body even when retained pages are complete.

The core bug is that renderer pass partitioning currently acts as stacking
order. That makes a resolution-storage decision visible to users.

## Desired Model

Build one explicit display list for each GPU-flow frame.

The display list is the canonical source of visual composition. Renderer passes
are execution details used to draw a command, not owners of stacking order.

Each command should include:

- `commandId`
- `ownerSurfaceId`
- `ownerSectionId`
- `role`
- `renderLayer`
- `zIndex`
- `sourceOrder`
- `bounds`
- `clipRect`
- `opacity`
- `textureSnapshot`
- `textureSourceRect`
- `textureStorageKind`
- `pipelineKind`

Important roles:

- `canvas-grid`
- `edge`
- `section-shell`
- `section-body-background`
- `retained-content-page`
- `retained-scrollbar`
- `dom-island-proxy`
- `selection-overlay`
- `resize-overlay`
- `drag-overlay`

Important layers:

1. Canvas background and grid
2. Edges below nodes
3. Section shell and body background
4. Retained content pages
5. Retained scrollbars and retained-native proxies
6. Section overlays, resize handles, selection, drag previews
7. Modal or global overlays

Exact names can change during implementation, but the ordering must be explicit
and test-covered.

## Non-Negotiable Invariants

- Texture layout kind does not affect render layer.
- A single-texture visual and a tiled visual with the same role/layer/z/source
  order render in the same stacking position.
- Retained content pages are not modeled as generic flat section visuals.
- Generic section textures do not own retained content body pixels.
- The section body background, if needed, is a separate lower-layer command.
- A later command may cover retained content only if its explicit layer and role
  say it is an overlay.
- Pending resolution work is not sampled by display-list commands.
- Display-list commands use complete committed texture snapshots only.
- Pan and zoom are transform-only for composition; they may select visible
  commands, but they do not change visual ownership.
- Hit testing and retained switch interaction use logical retained scene data,
  not texture freshness or display-list pass placement.

## Replacement Architecture

### 1. Add A Composition Baseline

Create an append-only report in `perf/reports/frontend/` for the current latest
recording before implementation.

Record:

- GPU-flow frame count
- zoom range
- retained missing page count at high zoom
- retained uploaded bytes and upload count
- generic uploaded bytes and top upload surfaces
- high-zoom texture layout transitions
- frame duration p95 and p99
- retained memory high-water mark

This report is the baseline for the replacement. The final implementation must
include a matching after report from a fresh reproduction.

### 2. Introduce Display List Types

Add a display-list module under `frontend/src/gpuFlow/htmlSurfaces/`.

Suggested types:

- `GpuRenderCommand`
- `GpuRenderLayer`
- `GpuRenderRole`
- `GpuRenderDisplayList`
- `GpuRenderBatch`
- `GpuRenderPipelineKind`

The display list should be sorted by:

1. `renderLayer`
2. `zIndex`
3. `sourceOrder`
4. `commandId`

Do not sort by `pipelineKind`, `textureStorageKind`, or texture size.

The command builder should be the only place that decides visual stacking.
Existing visual arrays should become intermediate command sources, not final
render order.

### 3. Separate Section Ownership

Change section rendering so broad generic section textures cannot draw over
retained content.

Required ownership split:

- Section shell/header/chrome commands own section chrome.
- Section body background commands own plain background below retained content.
- Retained content page commands own retained body content.
- Scrollbars and retained-native companions own overlay behavior above retained
  content.

If the DOM source for a section still captures a full section, the command
builder must clip or decompose it so the retained content body is not drawn by
the generic section command. Prefer changing the source generation so the full
body pixels are not captured in the generic texture at all.

Do not rely on "draw retained pages later" as the only fix. Content ownership
must make it impossible for a generic body texture to accidentally repaint over
retained content.

### 4. Integrate Retained Pages As First-Class Commands

Replace retained page conversion to generic flat visuals with retained page
display-list commands.

Each retained page command should include:

- retained surface ID
- owner section ID
- retained content version
- page key
- page LOD scale
- source rect
- sampled rect
- destination rect
- fallback status: `exact`, `lower-lod`, or `placeholder`
- render layer: retained content

The retained page cache still chooses the best committed page. The display list
then represents exactly what will be drawn. Missing high-resolution pages should
fall back to older committed pages, but the command should say that explicitly
for diagnostics.

### 5. Execute The Display List Without Reordering

Update the WebGPU renderer to consume ordered commands.

Implementation shape:

1. Build the display list.
2. Split it into contiguous batches that share `pipelineKind`.
3. Execute batches in display-list order.
4. Within a batch, draw commands in command order.

This allows `flat`, `tiled-flat`, `mesh`, `effect`, and solid commands to be
interleaved by visual order while still avoiding unnecessary pipeline churn when
adjacent commands share a pipeline.

Do not create one global flat array and one global tiled array as final render
inputs. That recreates the current bug.

Depth buffering can be considered later only if alpha and overlay semantics are
made explicit. The first replacement should preserve ordered alpha blending by
command sequence.

### 6. Make Texture Snapshots Immutable Inputs

Display-list commands must reference committed immutable snapshots.

The command builder must not read mutable texture records whose CSS size, pixel
size, source rect, or layout can change while upload work is pending. This plan
therefore depends on the committed/pending snapshot model from
`docs/plans/retained-canvas-texture-lifecycle-plan.md`.

For generic HTML textures, apply the same rule: commands sample committed
snapshots only. Pending resolution upgrades can prepare new snapshots, but they
cannot change a command's sampling metadata until commit.

### 7. Add Recorder Diagnostics

Extend `gpu-flow-frame` diagnostics so Chrome recordings can prove composition
order.

Add:

- `renderCommandCount`
- command counts by `renderLayer`, `role`, and `pipelineKind`
- batch count and max commands per batch
- retained command count and retained fallback counts
- high-zoom retained page desired/drawn/missing counts
- top uploaded surfaces with `role`, `renderLayer`, `pipelineKind`, and
  `textureStorageKind`
- occlusion-risk diagnostics for later commands that intersect retained content
  bounds

The occlusion diagnostic should be deterministic and cheap:

- For each visible retained content rect, scan later display-list commands.
- Report commands whose bounds intersect the retained rect and whose role is
  not an allowed retained overlay.
- Include surface ID, role, layer, zIndex, source order, command bounds, and
  retained rect.

This diagnostic should normally be empty. If it is non-empty, a recording should
explain which command can cover retained content.

### 8. Add Focused Automated Coverage

Add Vitest coverage around the display-list builder and renderer batching.

Required tests:

- A section shell command and retained content command render in the same order
  when the section texture is `single` and when it is `tiled`.
- A generic section body command cannot be emitted over a retained content rect.
- Retained content commands remain above section body background and below
  retained scrollbars.
- Display-list batching preserves command order across mixed pipeline kinds,
  such as `flat`, `tiled-flat`, `flat`.
- Changing texture storage from `single` to `tiled` does not change command
  layer, zIndex, source order, or final command position.
- Occlusion diagnostics report a later non-overlay command that intersects a
  retained content rect.
- Occlusion diagnostics do not report allowed retained scrollbars or resize
  overlays.

Add or update browser/E2E coverage for the settings reproduction:

- Zoom to at least `4.5`.
- Scroll while zoomed.
- Assert retained section content remains visible after settling.
- Click a retained switch after zoom/scroll and assert it toggles.
- Assert the latest recording has no retained-content occlusion diagnostics.

### 9. Verify Performance And Visual Stability

After implementation, capture a fresh Chrome recording for the settings
high-zoom reproduction and write an append-only after report in
`perf/reports/frontend/`.

Acceptance criteria:

- At zoom `>= 4`, retained content remains visible.
- Retained switch clicks still work after zoom and scroll.
- `retainedTexturePageMissingPageCount` may be non-zero only for genuinely
  first-visible content; it must not correlate with disappeared existing
  content.
- No non-overlay occlusion diagnostics intersect retained content.
- `settings-section__gui` and `settings-section__shortcuts` do not draw generic
  body pixels over retained content.
- A section texture switching from single to tiled does not alter display-list
  command order.
- Pan/zoom frame duration is no worse than the baseline, and any regression is
  explained in the after report.
- Generic high-zoom upload volume is lower or justified by explicit chrome-only
  ownership.

## Work Sequence

1. Baseline the latest recording in `perf/reports/frontend/`.
2. Add display-list types, render layers, roles, and builder tests.
3. Replace `HtmlSurfaceVisualScene` final ordering with a display list.
4. Split or clip section commands so generic section textures do not own
   retained body pixels.
5. Emit retained pages as first-class retained content commands.
6. Update renderer execution to batch contiguous commands without reordering.
7. Add recorder composition diagnostics.
8. Add high-zoom settings E2E coverage.
9. Capture a fresh Chrome recording and write the after report.
10. Delete obsolete pass-order assumptions and tests that only validate the old
    flat-before-tiled shape.

## Out Of Scope

- WebGL, Three.js, SVG `foreignObject`, or non-Chromium compatibility paths.
- DOM overlay fallback for retained settings content.
- Legacy renderer feature flags.
- Retaining old `flatSurfaces` / `tiledFlatSurfaces` arrays as the canonical
  render-order API.
- Fixing every retained texture upload cost in this plan. Upload scheduling and
  LOD refinement remain covered by
  `docs/plans/retained-canvas-tiled-lod-performance-plan.md`.

## Done Definition

- The renderer uses one explicit display list as the source of composition
  truth.
- Texture storage layout cannot change visual stacking.
- Retained content body ownership is separate from generic section chrome/body
  background ownership.
- Recorder diagnostics can explain composition order and retained-content
  occlusion risk.
- Automated tests fail if tiled section textures can cover retained content.
- A fresh high-zoom Chrome recording shows retained content stays visible and
  switches remain operable after zoom and scroll.
