# GPU Flow Strategy A2 Active Teleport Prototype

Date: 2026-04-29
Area: frontend GPU flow
Route: `http://127.0.0.1:3019/settings`, Settings -> All Settings
Browser: Chrome 147.0.0.0 on macOS, DPR 2
Chrome flags: `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`

## Change

Implemented the Strategy A2 prototype:

- The active React-owned node DOM is moved from the `<canvas layoutsubtree>` into a normal absolutely positioned overlay while the user is interacting with it.
- Texture uploads for the teleported node are explicitly deferred while the node is outside the canvas.
- Focus and text selection are restored after each DOM move.
- When the interaction settles, the same DOM node is restored as an immediate canvas child.
- The final texture upload waits until a canvas paint occurs after restore so `copyElementImageToTexture(...)` has a cached paint record.

This replaces the inert cloned active-node overlay in the runtime path. The old clone component remains in the repo for now only as unused fallback code.

## Baseline

The previous runtime path left the source node under the canvas and tried to keep the visible GPU texture current with repeated active `copyElementImageToTexture(...)` uploads. That made switch animation and text input feel delayed because the visual feedback depended on repeated full-node texture capture.

The Strategy A investigation also showed that moving a node outside the canvas without suppressing uploads produces repeated `copyElementImageToTexture(...)` failures because only immediate canvas children are valid capture sources.

## Verification Probe

CDP was run against the Settings page after starting the app with:

`CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./aireset.sh`

The browser probe interacted with `settings-section__backend`:

1. Dispatch pointerdown on the first switch.
2. Confirm the existing node moved from `CANVAS` to `data-gpu-flow-active-node-teleport-layer`.
3. Click the switch while teleported.
4. Confirm `aria-checked` changed while the node stayed teleported.
5. Wait for settle.
6. Confirm the same node restored under `CANVAS`.
7. Focus the node-local `Filter` input.
8. Confirm the node teleported and `document.activeElement` remained the input.
9. Type `strategy-a2`.
10. Confirm input value and caret were retained while teleported.
11. Blur and wait for settle.
12. Confirm the node restored under `CANVAS` with the typed value retained.

Observed state summary:

| Step | Node parent | Teleport marker | Switch checked | Filter value | Active element |
| --- | --- | --- | --- | --- | --- |
| Before | `CANVAS` | none | `true` | empty | `BODY` |
| After switch pointerdown | teleport layer | `active` | `true` | empty | `BODY` |
| After switch click | teleport layer | `active` | `false` | empty | `BODY` |
| After switch settle | `CANVAS` | none | `false` | empty | `BODY` |
| After input focus | teleport layer | `active` | `false` | empty | `INPUT[placeholder="Filter"]` |
| After input change | teleport layer | `active` | `false` | `strategy-a2` | `INPUT[placeholder="Filter"]` |
| After input settle | `CANVAS` | none | `false` | `strategy-a2` | `BODY` |

Console check after the probe:

- No `copyElementImageToTexture(...)` errors.
- Remaining console messages were pre-existing React Router / React 19 warnings/errors unrelated to the GPU flow change.

Screenshot artifact:

- `perf/reports/frontend/strategy-a2-active-teleport-settings-2026-04-29.png`

## Tests

Focused unit coverage:

`pnpm -C frontend exec vitest run src/gpuFlow/GpuActiveNodeTeleport.test.ts src/gpuFlow/nodeTextures.test.ts src/gpuFlow/GpuNodeLayer.test.tsx src/gpuFlow/nodeInteractionDirty.test.ts`

Result:

- 4 files passed.
- 35 tests passed.

Typecheck note:

- Full `pnpm -C frontend typecheck` still fails on existing repo-wide TypeScript errors.
- Filtering `pnpm -C frontend exec tsc --noEmit --pretty false` for `src/gpuFlow` showed only pre-existing GPU flow errors outside the files changed by this prototype:
  - `src/gpuFlow/edges/edgeSources.test.ts`
  - `src/gpuFlow/edges/edgeSources.ts`
  - `src/gpuFlow/interactions/edges.ts`

## Result

Strategy A2 is viable for the Settings switch/input path. The active node now uses real DOM during interaction and avoids repeated active texture uploads while outside the canvas. The final capture path needs the restore -> request paint -> upload ordering; uploading immediately after restore is not safe in Chrome because it can hit `No cached paint record for element`.

Remaining risk before broad rollout:

- CodeMirror and terminal sections still need dedicated browser checks.
- React reconciliation while a teleported node receives larger structural updates still needs stress testing.
- The old clone overlay code should be removed or made an explicit fallback after A2 coverage is broader.
