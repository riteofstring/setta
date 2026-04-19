# Settings All Settings CodeMirror Init Null-Pos Fallback Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-browser-resting-text.spec.ts`

## Goal

Keep the retained-canvas browser shell canary's first-click editor handoff resilient when the initial pointer coordinates do not map cleanly into the newly mounted CodeMirror instance.

## Change

- `frontend/src/components/Utils/CodeMirror/getOnCreateEditor.ts` now resolves the initial pointer anchor defensively:
  - tab activation still skips pointer-position selection
  - non-tab activation now ignores missing or non-finite `clientX/clientY`
  - if `view.posAtCoords(...)` returns `null`, the editor still initializes and focuses instead of staying stuck at `opacity-0`
- `frontend/src/components/Utils/CodeMirror/getOnCreateEditor.test.ts` now covers both the happy path and the null-position fallback

## Focused Browser Shell Verification

- `settings-section__browserSectionDefault` remained shell-owned and first-click editor activation stayed live through the existing browser shell canary
- result:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-022/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-browser-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (51.1s)`

## Dense Rerun

Fresh live rerun on the current runtime recorded:

- `documentNodeCount: 5493`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 46`
- `raf.meanMs: 42.71`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 49.9`
- `raf.maxMs: 1149.8`
- `longTasks.count: 8`
- `longTasks.totalMs: 6080`
- `longTasks.maxMs: 3672`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- this is a bounded editor-bootstrap hardening slice on the active retained-canvas lane, not a new dense-scene perf step
- the browser shell canary stayed live and the dense probe remained in the same `~42-43ms` / `~6.0s long-task total` band, so keep the fallback
- an attempted shared param-codeobj shell-ownership expansion during this iteration was reverted after first-click editor handoff still failed on `settings-section__rotaryParamCodeObjDefault`; that family is not ready for shell ownership yet

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Utils/CodeMirror/getOnCreateEditor.ts src/components/Utils/CodeMirror/getOnCreateEditor.test.ts tests/e2e/settings/settings-all-settings-param-codeobj-resting-text-cluster.spec.ts`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Utils/CodeMirror/getOnCreateEditor.test.ts`
  - result: `2 passed`, `29` tests
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-022/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-browser-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (51.1s)`
- Chrome DevTools MCP:
  - result: not trustworthy in this iteration
  - two fresh headless DevTools sub-agent passes on `/settings` -> `All Settings` could not produce a trustworthy `browserSectionDefault` graph-surface view after overview selection plus `fit view`
  - both passes reported a mostly blank / off-canvas dark canvas rather than useful product evidence, so treat the CDP gate for this slice as deferred rather than passed or failed product parity
