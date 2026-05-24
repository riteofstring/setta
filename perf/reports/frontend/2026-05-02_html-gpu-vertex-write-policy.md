# HTML GPU Surfaces Vertex-Write Policy

Date: 2026-05-02

## Scope

This report closes the pan/zoom vertex-buffer policy audit item from the
interactive HTML GPU surfaces plan. It does not introduce a new browser run; it
documents the current production behavior against the existing dense pan/zoom
evidence and adds focused renderer tests for the owner-level invariants.

## Decision

Setta keeps CPU-side flow-space culling for the default flat graph path. The
strict camera-uniform-only renderer path applies when the renderable visual
scene is unchanged. If an active pan/zoom gesture changes the culled visible set
or a tiled surface's tile layout, bounded flat or tiled-flat vertex-buffer
rewrites are allowed for that draw geometry.

Those geometry writes are not HTML recapture work. They remain invalid if they
cause `requestPaint`, `copyElementImageToTexture`, source DOM transform writes,
or React renders during pure pan/zoom.

## Evidence

The dense production pan/zoom report at
`perf/reports/frontend/2026-05-02_html-gpu-dense-panzoom-cdp.md` recorded the
separated active gesture window over the checked-in large-graph fixture:

| Counter                             |    Active gesture value |
| ----------------------------------- | ----------------------: |
| Texture uploads                     |                       0 |
| `requestPaint`                      |                       0 |
| Source mutations / transform writes |                   0 / 0 |
| Camera uniform writes               |  81 calls / 2,592 bytes |
| Flat vertex writes                  | 17 calls / 94,944 bytes |
| Avg / p95 / worst RAF interval      |  4.24 / 8.60 / 10.30 ms |
| Long tasks                          |                       0 |

The vertex writes occurred when the active gesture changed the renderer's
culled draw set. The zero upload/requestPaint/source-mutation counters remained
unambiguous because the passive post-gesture resolution recapture was measured
as a separate window.

## Guardrails

Focused renderer tests now assert:

- flat vertices are stable on viewport-only redraws;
- tiled-flat vertices are stable on viewport-only redraws;
- flat vertices rewrite when the visible surface set changes;
- tiled-flat vertices rewrite when tile layout changes.

CDP visual check: not run for this documentation/test-only policy slice; no
production UI behavior changed.
