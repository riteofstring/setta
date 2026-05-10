# HTML Surface API Probes

Date: 2026-05-01
Plan: `docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md`

## Scope

Added `frontend/src/gpuFlow/htmlSurfaces/apiProbes.ts` as the first
HTML GPU surface owner module. It provides a browser-runnable probe harness and
source policy validation for the assumptions the replacement architecture needs:

- required html-in-canvas and WebGPU API presence
- `copyElementImageToTexture` base, sized, and source-subrect overloads
- direct canvas-child upload requirement
- CSS transform capture and hit-testing behavior
- transform-only paint invalidation
- overlapping passive source upload
- hidden-source source policy
- `getElementTransform`, `paint.changedElements`, and `drawElementImage`
  transform behavior
- documented worker/capture API availability

## CDP Probe Run

Command used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Opened the Setta Vite app in the `./ai.sh` Chrome session.
- Loaded the probe module through Vite:
  `import('/src/gpuFlow/htmlSurfaces/apiProbes.ts')`.
- Ran `runHtmlSurfaceApiProbes()` from Chrome DevTools MCP.

Observed summary:

| Metric                      | Value |
| --------------------------- | ----: |
| Probe results               |    13 |
| Passing results             |    12 |
| Failed required probes      |     1 |
| Unsupported required probes |     0 |

Required checks that passed:

- `core-html-in-canvas-apis`
- `copy-element-image-to-texture-overloads`
- `direct-canvas-child-upload`
- `css-transform-capture`
- `css-transform-hit-testing`
- `overlapping-passive-source-capture`
- `hidden-source-capture-policy`
- `source-subrect-upload`
- `get-element-transform`
- `paint-changed-elements`
- `draw-element-image-transform`

Documented non-required check:

- `capture-element-image-worker`: `captureElementImage` was absent,
  `OffscreenCanvas` and `transferControlToOffscreen` were present. The initial
  replacement must stay on the main-thread direct upload path.

Remaining failure:

| Probe                               | Status | Evidence                                                                               |
| ----------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `transform-only-paint-invalidation` | failed | Transform-only source movement fired one `paint` event after an explicit paint settle. |

## Interpretation

Most required browser assumptions are now executable and verified in the local
flagged Chromium build. The remaining transform-only paint result is a real
replacement risk for the plan's O(1) interaction-source alignment path. The next
implementation phase should either prevent active source transform paint events
from dirtying/uploads, or re-audit the source movement strategy before treating
transform-only movement as paint-free.

## Focused Verification

```bash
pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/apiProbes.test.ts --environment jsdom
pnpm -C frontend exec eslint src/gpuFlow/htmlSurfaces/apiProbes.ts src/gpuFlow/htmlSurfaces/apiProbes.test.ts
./scripts/quality/check.sh
```

Results: all passed for the current diff.
