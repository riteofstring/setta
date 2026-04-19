# Settings All Settings Retained-Graph Attribution Report

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Clean dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Trace artifact: `perf/artifacts/frontend/settings-all-settings/backdrop-retained-graph-attribution-trace-2026-04-20.json`

## Goal

Capture one fresh dense rerun plus one fresh trace-backed attribution pass on the canonical `settings-section__browserSectionDefault` lane so the next product slice targets the current retained-graph hotspot instead of another guessed `SectionShellBackdropCanvas` micropolish pass.

## Canonical lane

- target section: `settings-section__browserSectionDefault`
- sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Fresh dense rerun

Fresh live rerun on the current worktree runtime recorded:

- `blankPanePoint: { x: 24, y: 60 }`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `codeMirrorCount: 0`
- `raf.meanMs: 58.82`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50.1`
- `raf.maxMs: 1533.3`
- `longTasks.count: 13`
- `longTasks.totalMs: 5303`
- `longTasks.maxMs: 844`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`

Compared against the current clean checkpoint in `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`:

- `documentNodeCount: 5494 -> 5494`
- `buttonCount: 47 -> 47`
- `canvasCount: 1 -> 1`
- `raf.meanMs: 42.58 -> 58.82`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 50 -> 50.1`
- `longTasks.count: 8 -> 13`
- `longTasks.totalMs: 5844 -> 5303`

Interpretation:

- the lane is still structurally stable on the current runtime: DOM counts, retained canvas count, and motion-hidden subtree churn stayed flat
- the rerun remained noisy in headless mode, so keep the pending-snapshot fast-path rerun as the clean whole-scene checkpoint instead of replacing it with this sample

## Trace result

Fresh headless Chrome DevTools MCP pass on the same runtime recorded:

- visual preflight:
  - `/settings` mounted: yes
  - `All Settings` active: yes
  - graph surface mounted and nonblank: yes
  - canonical target section present: yes
- trace kind:
  - insight set: `NO_NAVIGATION`
  - `CLS: 0.00`
- trace interaction:
  - one deterministic graph-surface pan in headless mode
  - post-trace viewport transform: `matrix(0.194382, 0, 0, 0.194382, 1225, -301.993)`

Local parsing of the saved trace artifact shows:

- ignore the first `~479ms` startup task:
  - `RunTask 479.641ms`
  - nested `TimerFire 479.341ms`
  - nested `FunctionCall` mapped to `src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:198`
  - this is workspace-chat noise, not trusted renderer evidence for the settings graph lane
- after excluding that startup artifact, the largest main-thread work in the traced interaction window was:
  - `RunTask 144.739ms`
  - nested `RunMicrotasks 133.921ms`
  - nested `v8.callFunction 130.038ms`
  - nested `FunctionCall` mapped to `react-dom_client.js`
- the largest follow-on renderer/compositor work in the same window was smaller:
  - `Commit 26.094ms`
  - `Commit 23.644ms`
  - `HitTest 18.236ms` total
  - `Paint 13.394ms` total
  - `EventDispatch 9.568ms` total
  - `Layerize 9.502ms`
  - `Layout 1.215ms`

Local CPU sample aggregation over the post-startup long-task window points more strongly at graph-surface section rerender work than at retained-backdrop paint work:

- dominant graph-surface app frames:
  - `_SectionContainerCore @ src/components/Section/Container/SectionContainerCore.tsx:168`
  - `_SectionContainerCoreResizable @ src/components/Section/Container/SectionContainerCoreResizabe.tsx:462`
  - `syncViewportInteractionActive @ src/forks/xyflow/core/container/ZoomPane.tsx:87`
  - `flushViewportTransformUpdate @ src/forks/xyflow/core/container/ZoomPane.tsx:143`
- backdrop-specific frames were present, but materially smaller in this trace window:
  - `SectionShellBackdropCanvas @ src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx:1162`
  - `useCanvasOwnedSectionBackdropMeasurements @ src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx:1032`
- non-target workspace-chat frames were also present in the same trace window:
  - `ProjectChatCore`
  - `ChatInput`
  - `workspacePythonSignals`

## Interpretation

- This trace does not justify another default pass on `SectionShellBackdropCanvas` observer timing, post-motion flushes, or node-map equality by inertia.
- The strongest graph-surface signal in the checked post-startup window is section-container rerender work under viewport interaction, with `ZoomPane` still visible but secondary and backdrop measurement hooks smaller still.
- The trace is not clean enough to make workspace-chat code itself the product target; that activity is oracle noise because the CDP pass was not chat-normalized the same way as the dense Playwright probe.
- The next bounded product slice should therefore target `SectionContainerCore` / `SectionContainerCoreResizable` viewport-interaction rerender fanout on the canonical lane rather than reopening another backdrop invalidation sub-lane.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-008/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (42.1s)`
- Chrome DevTools MCP:
  - fresh headless DevTools sub-agent bootstrapped to the worktree runtime
  - visual preflight passed on `/settings` with `All Settings` active and the graph surface visibly mounted
  - headless `NO_NAVIGATION` trace saved to `perf/artifacts/frontend/settings-all-settings/backdrop-retained-graph-attribution-trace-2026-04-20.json`

## Follow-up

- Close the current “maybe one more backdrop invalidation cleanup” attribution question here.
- The next product slice on `settings-section__browserSectionDefault` should attack viewport-interaction rerender fanout in `SectionContainerCore` / `SectionContainerCoreResizable`.
- If a later trace is needed on this lane, normalize project chat off first so workspace-chat timers do not contaminate the renderer attribution window.
