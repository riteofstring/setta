# Frozen workspace overview and canvas performance - 2026-06-19

Implemented the plan in `docs/plans/frozen_workspace_overview_canvas_performance_plan.md` for
frozen overview geometry, non-blocking snapshot handoff metrics, workflow graph freeze control, and
large-canvas backing-store caps.

## Implementation Summary

- Overview transitions now derive their endpoint from a captured normal-mode frame, so maximized
  panes preserve their visual aspect ratio while entering overview.
- Snapshot handoff records capture requests, transition-time capture requests, transition-time
  awaits, and fresh/stale/missing texture usage. Transition startup uses existing textures only.
- Terminal and workflow graph panes are included in idle bitmap prewarm eligibility.
- Workflow graph renderers expose an explicit frozen handle. Freeze stops the Pixi ticker, cancels
  active interactions, ignores input, and defers renderer resize until resume.
- Workflow graph renderer resolution is capped at 12,000,000 backing pixels per live graph pane.
- New production Electron performance workflows are registered in the `performance` tier:
  `workflow-graph-maximized-4k-overview`, `workflow-graph-maximized-idle-4k`, and
  `terminal-maximized-4k-overview`.

## Focused Checks

```bash
pnpm -C desktop typecheck
pnpm -C desktop exec vitest run \
  src/renderer/src/workspace-layout/layout-engine.test.ts \
  src/renderer/src/workspace-layout/workspace-frozen-frame.test.ts \
  src/renderer/src/workspace-layout/frame-scheduler.test.ts \
  src/renderer/src/workspace-layout/metrics.test.ts \
  src/renderer/src/workspace-layout/surface-registry.test.ts \
  src/renderer/src/workspace-layout/runtime-policy.test.ts \
  src/renderer/src/workspace-layout/react-dom-surface-adapter.test.tsx \
  src/renderer/src/workspace-layout/presentation-engine.test.ts \
  src/renderer/src/features/workspace-graph/pixi-renderer-application.test.js
pnpm -C desktop build
```

Result: passed.

## Final Repository Gate

```bash
./scripts/format.sh
./check_quality.sh --all
```

Result: passed. The required Electron workflow tier passed through `semantic-cartographer-auto`.

## Electron Performance Workflows

All workflows used a 3840x2160 CDP viewport and production Electron/main/preload/renderer paths.
The repo-local Go 1.26.4 toolchain was installed with `./scripts/install_go_toolchain.sh` so the
terminal backend could start.

```bash
node desktop/tests/electron/workflow-graph-maximized-4k-overview.test.mjs --skip-build
node desktop/tests/electron/workflow-graph-maximized-idle-4k.test.mjs --skip-build
node desktop/tests/electron/terminal-maximized-4k-overview.test.mjs --skip-build
```

Result: passed.

| Workflow | Artifact | Enter p95 | Enter p99 | Enter max | Long tasks | Transition capture starts | Transition capture awaits |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| workflow graph 4K overview | `.recordings/workflow-graph-4k-overview/20260619T010642135Z` | 18.10 ms | 18.50 ms | 18.60 ms | 0 | 0 | 0 |
| workflow graph idle/frozen 4K | `.recordings/workflow-graph-idle-4k/20260619T010708949Z` | 17.90 ms | 18.60 ms | 66.50 ms | 0 | 0 | 0 |
| terminal 4K overview | `.recordings/terminal-4k-overview/20260619T011502813Z` | 18.40 ms | 18.70 ms | 18.70 ms | 0 | 0 | 0 |

## Canvas And Freeze Evidence

| Scenario | Backing pixels | Live canvas in overview | Frozen frame delta | Frozen resize delta | Ticker frames while frozen |
| --- | ---: | ---: | ---: | ---: | ---: |
| workflow graph maximized 4K | 7,596,000 | 0 | - | - | 0 |
| workflow graph idle/frozen 4K | 7,596,000 | 0 | 0 | 0 | 0 |

The graph backing store stayed below the 12,000,000 pixel cap at 3600x2110. During the frozen
overview sample, the debug snapshot reported unchanged frame count and renderer resize count.

## Terminal Evidence

The terminal workflow entered overview while command output was active, reported
`liveTerminalRendererCount: 0` in overview, exited back to normal, and found
`frozen-terminal-199` in terminal scrollback after resume.

The terminal workflow recorded zero texture-use increments for the focused terminal overview path.
That path still asserted the important animation contract: no transition-time snapshot capture
starts, no transition-time capture awaits, no live terminal renderer during overview, and preserved
scrollback after resume. Unit coverage continues to verify terminal bitmap prewarm eligibility in
the surface registry.

## Follow-up: Frozen Live Overview Visuals

After visual inspection of the overview artifacts, the snapshot handoff still produced grey
placeholder cards whenever a warmed bitmap was missing and remounted the real surface on exit. The
follow-up changes keep DOM, terminal, graph, and canvas panes mounted during overview/movement as
`live-throttled` frozen surfaces. Browser native views continue using their native snapshot path.

Workflow graph metrics also cache frozen canvas stats so frame metric sampling does not force an
expensive debug snapshot every animation frame while the renderer is frozen.

```bash
pnpm -C desktop typecheck
pnpm -C desktop exec vitest run \
  src/renderer/src/workspace-layout/react-dom-surface-adapter.test.tsx \
  src/renderer/src/workspace-layout/runtime-policy.test.ts \
  src/renderer/src/workspace-layout/surface-registry.test.ts
pnpm -C desktop build
node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs --skip-build
node desktop/tests/electron/workflow-graph-maximized-4k-overview.test.mjs --skip-build
node desktop/tests/electron/terminal-maximized-4k-overview.test.mjs --skip-build
```

Result: passed.

| Workflow | Artifact | Overview runtime | Enter p95 | Exit p95 | Transition capture starts | Transition capture awaits | Live renderer count in overview |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| DOM pane frozen overview | `.recordings/dom-pane-snapshot-scroll/20260619T023458287Z` | `chat-dom` / `live-throttled` / frozen | - | - | 0 | 0 | - |
| workflow graph 4K overview | `.recordings/workflow-graph-4k-overview/20260619T023428683Z` | `workflow-graph` / `live-throttled` / frozen | 17.0 ms | 16.7 ms | 0 | 0 | `liveCanvasPaneCount: 0` |
| terminal 4K overview | `.recordings/terminal-4k-overview/20260619T023516748Z` | `terminal` / `live-throttled` / frozen | 17.4 ms | 17.3 ms | 0 | 0 | `liveTerminalRendererCount: 0` |

## Follow-up: Single Overview Layout Endpoint

The previous frozen-live pass still used a separate captured-frame overview geometry endpoint
during the zoom animation. The settled overview frame then switched back to the canonical layout
engine overview frame, which could visibly snap from the animated zoom target to a closer settled
scale. This follow-up removes the separate frozen geometry helper. The scheduler now caches normal
and overview endpoint frames from the same layout engine and interpolates between those official
endpoints; runtime policy remains responsible for freezing pane contents.

```bash
pnpm -C desktop exec vitest run \
  src/renderer/src/workspace-layout/frame-scheduler.test.ts \
  src/renderer/src/workspace-layout/layout-engine.test.ts \
  src/renderer/src/workspace-layout/runtime-policy.test.ts \
  src/renderer/src/workspace-layout/surface-registry.test.ts
pnpm -C desktop typecheck
pnpm -C desktop build
node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs --skip-build
node desktop/tests/electron/workflow-graph-maximized-4k-overview.test.mjs --skip-build
node desktop/tests/electron/terminal-maximized-4k-overview.test.mjs --skip-build
```

Result: passed.

| Workflow | Artifact | Enter p95 | Exit p95 | Transition capture starts | Transition capture awaits | Live renderer count in overview |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| DOM pane frozen overview | `.recordings/dom-pane-snapshot-scroll/20260619T033132387Z` | - | - | 0 | 0 | - |
| workflow graph 4K overview | `.recordings/workflow-graph-4k-overview/20260619T033150626Z` | 17.6 ms | 16.8 ms | 0 | 0 | `liveCanvasPaneCount: 0` |
| terminal 4K overview | `.recordings/terminal-4k-overview/20260619T033213605Z` | 17.6 ms | 17.6 ms | 0 | 0 | `liveTerminalRendererCount: 0` |

## Follow-up: Frozen DOM Covers And 4K Resize Cap

The prior frozen-live DOM path still left the live React subtree hit-testable and selectable while
overview was active. It also depended on renderer resize resolution only at Pixi initialization,
so a maximized 4K graph could grow a 30,384,000-pixel backing store after viewport resize. This
follow-up installs a static DOM visual cover for React DOM panes, hides the live subtree with
`content-visibility: hidden`, skips scroll-offset layout reads once the live subtree is hidden, and
recomputes the workflow graph renderer resolution cap on every Pixi resize.

Workflow graph debug snapshots now fall back from DOM client geometry to the renderer screen size
when hidden Electron reports a zero canvas client box even though Pixi is still rendering. This
keeps the performance workflow measuring the active renderer instead of timing out on hidden-window
DOM geometry.

```bash
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.test.js \
  src/renderer/src/features/workspace-graph/pixi-renderer-application.test.js \
  src/renderer/src/workspace-layout/react-dom-surface-adapter.test.tsx \
  src/renderer/src/workspace-layout/runtime-policy.test.ts \
  src/renderer/src/workspace-layout/surface-registry.test.ts
pnpm -C desktop typecheck
pnpm -C desktop build
node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs --skip-build
node desktop/tests/electron/workflow-graph-maximized-4k-overview.test.mjs --skip-build
```

Result: passed.

| Workflow | Artifact | Enter p95 | Exit p95 | Backing pixels | Live renderer count in overview |
| --- | --- | ---: | ---: | ---: | ---: |
| DOM pane frozen overview | `.recordings/dom-pane-snapshot-scroll/20260619T040005694Z` | - | - | - | live content hidden; frozen visual found |
| workflow graph 4K overview | `.recordings/workflow-graph-4k-overview/20260619T042413713Z` | 17.0 ms | 17.0 ms | 8,294,400 | `liveCanvasPaneCount: 0` |
| terminal 4K overview | `.recordings/terminal-4k-overview/20260619T035855476Z` | 17.4 ms | 17.5 ms | - | `liveTerminalRendererCount: 0` |

DOM overview evidence: `centerHitLiveContent: false`, `frozenVisualFound: true`, and
`liveContentHidden: "true"` for the chat pane. Graph overview evidence:
`canvasTickerFramesWhileFrozen: 0`, `canvasRendererResizeCount: 1`, and no transition-time snapshot
capture waits.

## Follow-up: Frozen DOM Scrollbar Suppression

The frozen DOM visual cover initially hid the live React subtree but allowed cloned inner scrollers
to keep their native scrollbar styling. During overview entry, the chat pane could briefly paint a
scrollbar from the static frozen visual even though live content was no longer hit-testable. This
follow-up scopes scrollbar suppression to `.workspace-frozen-dom-visual` and the cloned chat
transcript scroller while preserving normal scrollbar behavior after overview exits.

The DOM pane workflow now asserts that overview is ready only when the frozen cloned chat scroller
exists and reports `scrollbar-width: none`.

```bash
pnpm -C desktop exec eslint tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs
pnpm -C desktop typecheck
pnpm -C desktop build
node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs --skip-build
./scripts/format.sh
./check_quality.sh --all
```

Result: passed. The required Electron workflow tier passed through `semantic-cartographer-auto`,
including `dom-pane-snapshot-scroll` at
`.recordings/dom-pane-snapshot-scroll/20260619T141631582Z`.
