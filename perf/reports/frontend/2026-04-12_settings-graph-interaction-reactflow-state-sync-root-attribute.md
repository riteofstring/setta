## 2026-04-12 16:44 UTC

Lane: `rotaryParamCodeObjDefault`

Slice:

- move the canary viewport-interaction shell hint off the per-section
  `useReactFlow((state) => state.viewportInteractionActive)` subscription path
  and onto the graph-substrate root as a DOM attribute
- keep the same transform/backface/isolation shell styling through a scoped CSS
  selector on the canary root
- short-circuit redundant canary `useReactFlow.setState(...)` writes when
  `paneDragging` and `viewportInteractionActive` are already equal to the
  requested values

Files:

- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
- `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- `frontend/src/index.css`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`

Focused verification:

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx`
  - passed (`3` files, `19` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx src/components/Section/Container/SectionContainerCore.tsx src/index.css`
  - passed

Broader probe status:

- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-015/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-015/main-ai.log`
  - failed on the repeated runtime stall:
    `Timed out after 30000ms during settings graph probe phase: worktree: capture initial pane state.`

CDP status:

- fresh-context headless DevTools smoke on explicit worktree/reference URLs
  completed
  - both `/settings` surfaces reached a visible mounted settings/graph surface
  - no obvious visual drift was observed for this slice

Reading:

- this is one bounded product-side attempt to cut work inside the measured
  owner `interactionReactFlowStateSync` by removing section-wide ReactFlow
  subscription fan-out from the canary motion hint
- the next iteration should rerun the canonical lane from a fresh lifecycle and
  verify whether `interactionReactFlowStateSync` still dominates once the live
  preflight/CDP path is healthy again
