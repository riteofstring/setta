# HTML GPU Source Policy Verification

Date: 2026-05-02

## Scope

Follow-up verification for the source DOM policy blocker in
`docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md`.

The browser run used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Route: `http://127.0.0.1:3019/settings`.

## Result

CDP evaluated production Setta source hosts with the same policy checks as
`evaluateHtmlSurfaceSourcePolicy`: direct canvas child, real layout box, not
`display: none`, not `visibility: hidden`, not `opacity: 0`, no hidden
`clip-path`, and not parked offscreen.

| Metric | Value |
| --- | ---: |
| `canvas[layoutsubtree]` | 1 |
| `[data-gpu-flow-html-source="true"]` | 46 |
| Source-policy failures | 0 |
| Active teleport layers | 0 |
| Teleported nodes | 0 |
| Settling clones | 0 |

Sample source host result:

```json
{
  "sourceId": "settings-section__backend",
  "issues": [],
  "parentTag": "CANVAS",
  "visibility": "visible",
  "inlineVisibility": "",
  "display": "block",
  "opacity": "1",
  "clipPath": "none",
  "rect": { "left": 0, "top": 36, "width": 552, "height": 352 },
  "clientRectCount": 1,
  "pointerEvents": "none"
}
```

Screenshot:
`perf/reports/frontend/2026-05-02_html-gpu-source-policy-after.png`.

Console contained only existing React Router future-flag and React 19
`element.ref` warnings/errors already present in prior reports; no new
html-in-canvas source-policy errors were observed.

CDP visual check: done (`./ai.sh`, `/settings`, 46 production source hosts,
0 source-policy failures, 0 teleport/settling markers).
