# HTML GPU Settings Zoom Tiling Artifact Check

Date: 2026-05-02

## Context

Manual Chrome recording screenshots showed Setta settings nodes rendering
correctly at lower zoom levels, then abruptly shrinking with sliver-like
fragments after additional zoom. The failure appeared when regular settings
nodes crossed the default tiled-texture threshold.

## Change Under Test

HTML GPU surface tests now run on Chrome for Testing 149+ when
`CanvasDrawElement` is requested. Chrome 147/148 expose source-subrect uploads
but do not expose the scaled source-subrect overload needed for tiled high-zoom
HTML surfaces.

The tiled texture path keeps the 2048 px default tile dimension and uploads each
tile with:

`copyElementImageToTexture(source, sx, sy, sw, sh, width, height, destination)`

The startup and repro scripts resolve a Chrome for Testing build with Chromium
149+ support for that overload. On macOS, the dedicated browser launch also uses
`--use-mock-keychain` so the test browser does not request access to the user's
real keychain credentials.

## Scenario

- App/browser launched with Chrome for Testing 149.0.7821.0 via
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`.
- Navigated to `http://127.0.0.1:3019/settings`.
- Reset zoom, instrumented `GPUQueue.copyElementImageToTexture`, and sent
  Ctrl-wheel zoom gestures over the settings canvas.
- Captured upload call shapes after zooming to 10.

## Result

| Metric | Result |
| --- | ---: |
| Zoom 10 upload calls | 11 |
| Zoom 10 4-arg full-surface uploads | 3 |
| Zoom 10 8-arg scaled source-subrect uploads | 8 |

Sample high-zoom tiled uploads:

| Surface | Arguments |
| --- | --- |
| `sectionSizingPolicy:0:0` | `[0, 0, 512, 352, 2048, 1408]` |
| `sectionSizingPolicy:1:0` | `[512, 0, 40, 352, 160, 1408]` |
| `languageServer:0:0` | `[0, 0, 512, 122, 2048, 488]` |
| `languageServer:1:0` | `[512, 0, 40, 122, 160, 488]` |

## Notes

Local Google Chrome 147 and Chrome for Testing Stable 148 rejected the 8-arg
overload with `TypeError: The provided value is not of type
GPUImageCopyTextureTagged`. Chrome for Testing Canary 149 accepted the overload,
so the Setta launch scripts now use that build for html-in-canvas verification
instead of downgrading the production path to avoid tiling.

## Follow-Up CDP Verification

The app-level CDP pass relaunched Setta with the shared Chrome for Testing
149.0.7821.0 resolver and injected the upload probe before the Settings app
initialized.

| Check | Result |
| --- | ---: |
| Initial Settings uploads observed after reload | 6 |
| High-zoom wheel-gesture upload calls | 17 |
| High-zoom 4-arg full-surface uploads | 5 |
| High-zoom 8-arg scaled source-subrect uploads | 12 |
| High-zoom `writeTexture` calls | 0 |
| High-zoom requestAnimationFrame calls during probe window | 6 |
| `copyElementImageToTexture` console errors | 0 |

Sample high-zoom 8-arg calls from the live Settings canvas:

| Source | Arguments |
| --- | --- |
| `gui` | `[0, 0, 256, 256, 2048, 2048]` |
| `gui` | `[256, 0, 256, 256, 2048, 2048]` |
| `gui` | `[512, 0, 40, 256, 320, 2048]` |
| `gui` | `[0, 256, 256, 96, 2048, 768]` |

The high-zoom screenshot showed the real Settings node content enlarged without
the earlier shrink/sliver artifacts:

- `perf/reports/frontend/2026-05-02_settings-cdp-high-zoom-149-after.png`

The macOS launch was also verified directly from the running process argv:

`Google Chrome for Testing 149.0.7821.0 ... --use-mock-keychain ...`

Existing unrelated console noise remained from React 19 `element.ref` access and
accessibility issues, but there were no new html-in-canvas upload errors.
