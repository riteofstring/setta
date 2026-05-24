# GpuFlow Retained Content Settings Browser Verification

Date: 2026-05-06

## Recording

- Fresh recording:
  `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260506-145904`
- Route: `/settings`
- Chrome flags:
  `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`
- Repro target: `settings-section__sectionSizingPolicy:param-content:unpinned`
- Markers:
  - `final-1200x672-start` / `final-1200x672-end`
  - `final-1440x900-start` / `final-1440x900-end`

## Results

- Retained scroll console/page errors: `0`
- Pre-existing React dev `element.ref` console errors: `6`
- 1200x672 marked retained-scroll window:
  - Window: `3680ms`
  - Frames: `281`
  - Approximate FPS over marked window: `76.4`
  - Frame gap average / median / p95 / max: `8.9ms / 8.0ms / 16ms / 32ms`
  - GPU frame duration average / median / p95 / max:
    `0.22ms / 0.2ms / 0.5ms / 3.1ms`
  - Final retained surface scroll offset: `y=1000`
  - Canvas viewport unchanged during the scroll burst.
- 1440x900 marked retained-scroll window:
  - Window: `2038ms`
  - Frames: `116`
  - Approximate FPS over marked window: `56.9`
  - Frame gap average / median / p95 / max: `8.9ms / 8.0ms / 16ms / 18ms`
  - GPU frame duration average / median / p95 / max:
    `0.18ms / 0.2ms / 0.3ms / 1.2ms`
  - Final retained surface scroll offset: `y=1400`
  - Canvas viewport unchanged during the scroll burst.

## Upload Notes

The marked windows include initial visibility/paint uploads after navigation or
viewport fitting. During sustained retained wheel scrolling, frames were
reported as `viewport`/`paint` work with no repeated full-scene texture upload
cadence. The largest reported upload frame in the marked windows uploaded `2`
nodes with `2` diagnostics, clustered at the start of each marked window.

## DOM Island Follow-Up

This iteration also updates retained-content DOM island geometry in the same
renderer-owned scene update used by hot scroll. Existing DOM island elements are
style-synced imperatively so active native editor overlays follow retained
scroll offsets without forcing the React scene rebuild path. Focused unit
coverage verifies island movement and hiding when the active row leaves the
surface clip.
