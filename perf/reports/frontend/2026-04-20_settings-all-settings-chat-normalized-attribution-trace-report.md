# Settings All Settings Chat-Normalized Attribution Trace Report

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Clean dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Trace artifact: `perf/artifacts/frontend/settings-all-settings/chat-normalized-attribution-trace-2026-04-20.json`

## Goal

Complete the required post-run-`048` chat-normalized attribution pass on the canonical `settings-section__browserSectionDefault` lane so the next iteration picks one new frontier outside the now-closed `SectionContainerCore` / `SectionContainerCoreResizable` micro-lane.

## Canonical lane

- target section: `settings-section__browserSectionDefault`
- scope: whole-scene `settings` -> `All Settings`

## Fresh Dense Rerun

Fresh live rerun on the current worktree runtime recorded:

- `blankPanePoint: { x: 24, y: 60 }`
- `viewModeName: "All Settings"`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `codeMirrorCount: 0`
- `viewportStart: { x: 759.9, y: -41.8, zoom: 0.1 }`
- `viewportEnd: { x: 759.9, y: -41.8, zoom: 0.1 }`
- `raf.meanMs: 47.48`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 66.7`
- `raf.maxMs: 933.3`
- `longTasks.count: 17`
- `longTasks.totalMs: 3458`
- `longTasks.maxMs: 572`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`

Compared against the current kept checkpoint in `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`:

- `documentNodeCount: 5494 -> 5494`
- `buttonCount: 47 -> 47`
- `canvasCount: 1 -> 1`
- `raf.meanMs: 42.58 -> 47.48`
- `raf.p95Ms: 50 -> 66.7`
- `longTasks.totalMs: 5844 -> 3458`

Interpretation:

- the canonical lane stayed structurally stable on the live runtime: chat chrome stayed at `0`, DOM/canvas counts stayed flat, and subtree churn stayed at `0`
- this sample does not beat the kept whole-scene checkpoint, so keep the pending-snapshot fast-path rerun as the branch checkpoint instead of replacing it

## Trace Result

Fresh headless Chrome DevTools MCP pass on the same runtime recorded:

- bootstrap load: succeeded
- `/settings` load: succeeded
- `All Settings` active: yes
- chat chrome after normalization: `0`
- graph surface nonblank: yes
- `canvasCount: 1`
- trace saved successfully to `perf/artifacts/frontend/settings-all-settings/chat-normalized-attribution-trace-2026-04-20.json`
- post-trace viewport transform: `matrix(0.1, 0, 0, 0.1, 717.4, -41.8)`

Trust limits on this trace:

- the graph surface stayed visibly mounted and nonblank, but the final post-trace DOM check no longer found `settings-section__browserSectionDefault`
- treat this saved trace as normalized whole-scene attribution evidence, not as a targeted named-section parity proof

Local parsing of the saved trace artifact shows:

- no new shared renderer-main app-JS hotspot was credibly named outside the already-closed section-container lane
- the trace window was dominated by whole-scene browser/compositor work instead:
  - `RunTask`: `14166.750ms` total, `565.949ms` max
  - `Layerize`: `2528.941ms` total, `37.896ms` max
  - `Paint`: `2131.466ms` total, `17.472ms` max
  - `Commit`: `1772.251ms` total, `27.483ms` max
  - `HitTest`: `117.681ms` total, `9.842ms` max
- the CPU profile did not surface a new product-side JS leader:
  - sampled JS time stayed concentrated in browser `(program)` / `(idle)` buckets plus the injected trace motion loop itself
  - sampled garbage-collector time was present but secondary at `152.967ms`

## Interpretation

- This completes the required chat-normalized attribution pass after run `048`.
- The cleaned evidence still does not justify reopening `SectionContainerCore`, `SectionContainerCoreResizable`, `SectionShellBackdropCanvas`, `ZoomPane`, or motion-hidden DOM-sync micro-lanes by inertia.
- Because the normalized trace did not name a better shared renderer-main JS hotspot, the next frontier should now default to the broader Pixi-owned graph-surface ownership step.
- The strongest remaining candidate is the shared row/article/resize chrome primitive identified by the earlier row-body ranking, not another local memo/subscription cleanup.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-001/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (39.3s)`
- Chrome DevTools MCP:
  - fresh headless DevTools sub-agent consumed a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized to `/settings` with `All Settings` active and project chat chrome cleared
  - verified the graph surface stayed mounted and nonblank with `canvasCount: 1`
  - saved `perf/artifacts/frontend/settings-all-settings/chat-normalized-attribution-trace-2026-04-20.json`

## Follow-up

- Close the post-run-`048` attribution / replan question here.
- The next iteration should land one broader graph-surface ownership slice on the canonical lane by moving shared row/article/resize chrome off the moving DOM surface.
- Do not spend the next default pass on another attribution-only rerun or another `SectionContainerCoreResizable` micro-pass unless a future product slice reopens that lane with new evidence.
