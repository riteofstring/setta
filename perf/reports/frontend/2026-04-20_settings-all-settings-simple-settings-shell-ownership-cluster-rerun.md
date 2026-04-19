# Settings All Settings Simple Settings Shell Ownership Cluster Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Focused probes:
- `frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts`
- `frontend/tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts`
Dense probe:
- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`

## Goal

Land one broader Pixi-owned graph-surface ownership step after the closed section-container memo lane by promoting the existing simple settings resting-text family from resting-text-only ownership to full shell ownership on the `canvas-shell-underlay` path.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - promotes `settings-section__shortcuts`, `settings-section__spreadsheetSectionDefault`, `settings-section__taskBoardSectionDefault`, and `settings-section__stateMachineStartSectionDefault` into `CANVAS_OWNED_SECTION_SHELL_IDS`
  - aliases the new shell ids directly to the already-landed resting-text section ids instead of opening a separate renderer branch
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - now proves the simple settings cluster belongs to the shell-owned set
- `frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts`
  - now asserts the outer section root and inner `CustomResizable` expose `data-canvas-owned-shell="true"` with transparent shell styling
  - upgrades the focused proof from editor focus-only to a first-click `mousedown` activation check on `advancedSearchShortcut`
- `frontend/tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts`
  - now asserts the same shell-owned boundary and transparent shell styling for `spreadsheetSectionDefault`, `taskBoardSectionDefault`, and `stateMachineStartSectionDefault`
  - keeps the existing inline first-focus editor proof for the trio's canonical rows

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
  - Chrome DevTools MCP, headless Chromium
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__shortcuts`
- Sibling proof sections:
  - `settings-section__spreadsheetSectionDefault`
  - `settings-section__taskBoardSectionDefault`
  - `settings-section__stateMachineStartSectionDefault`
- Dense canary remains:
  - `settings-section__browserSectionDefault`

## Focused Runtime Result

The live simple-settings ownership probes confirmed:

- `settings-section__shortcuts`
  - section root and inner `CustomResizable` both exposed `data-canvas-owned-shell="true"`
  - outer and inner shell backgrounds computed as `rgba(0, 0, 0, 0)`
  - the hidden resting `advancedSearchShortcut` input still painted distinct retained-canvas text pixels at rest
  - first-click `mousedown` activation still replaced the hidden resting input with exactly one inline CodeMirror editor in the same section
- `settings-section__spreadsheetSectionDefault`
  - section root and inner `CustomResizable` both exposed `data-canvas-owned-shell="true"`
  - shell backgrounds computed as `rgba(0, 0, 0, 0)`
  - `liveInputCount` stayed `0` at rest while `activeSheet` remained on the lightweight retained-text path
- `settings-section__taskBoardSectionDefault`
  - section root and inner `CustomResizable` both exposed `data-canvas-owned-shell="true"`
  - shell backgrounds computed as `rgba(0, 0, 0, 0)`
  - `liveInputCount` stayed `0` at rest while `viewMode` remained on the lightweight retained-text path
- `settings-section__stateMachineStartSectionDefault`
  - section root and inner `CustomResizable` both exposed `data-canvas-owned-shell="true"`
  - shell backgrounds computed as `rgba(0, 0, 0, 0)`
  - `liveInputCount` stayed `0` at rest while `label` remained on the lightweight retained-text path

The trio probe attached these post-change inventories:

- `settings-section__spreadsheetSectionDefault`
  - `uniqueParamInputCount: 7`
  - `lightweightRestingTextCount: 7`
  - `underlineCount: 7`
  - `liveInputCount: 0`
- `settings-section__taskBoardSectionDefault`
  - `uniqueParamInputCount: 7`
  - `lightweightRestingTextCount: 7`
  - `underlineCount: 7`
  - `liveInputCount: 0`
- `settings-section__stateMachineStartSectionDefault`
  - `uniqueParamInputCount: 7`
  - `lightweightRestingTextCount: 7`
  - `underlineCount: 7`
  - `liveInputCount: 0`

Interpretation:

- this is a real broader graph-surface ownership step rather than another section-container or memo-only cleanup
- the simple settings cluster now uses the retained shell path at rest while preserving the already-landed lightweight text/underline/editor handoff behavior
- the change stays within the existing `go-rewrite` canvas-shell architecture instead of reopening the reverted shared param-codeobj shell lane

## Dense Companion Result

Dense rerun on the same worktree runtime recorded:

- `projectChatChromeCount: 0`
- `documentNodeCount: 5497`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 44.4`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 83.3`
- `raf.maxMs: 550`
- `longTasks.count: 18`
- `longTasks.totalMs: 3257`
- `longTasks.maxMs: 531`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`

Interpretation:

- the dense canary stayed in the current improved runtime band with the graph surface still mounted and motion-hidden subtree churn still at zero
- this is not yet the missing whole-scene performance breakthrough, but it does move another shared visible family onto shell ownership without reopening the spent section-container lane
- the next frontier should keep chasing broader scene-authority or compositor-facing ownership work rather than returning to local section-container memo churn

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - result: `1 passed (27 tests)`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-002/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `3 passed (1.2m)`
- Chrome DevTools MCP:
  - result: done in a fresh headless sub-agent
  - `All Settings` was active
  - one retained canvas was mounted
  - `settings-section__shortcuts`, `settings-section__spreadsheetSectionDefault`, `settings-section__taskBoardSectionDefault`, and `settings-section__stateMachineStartSectionDefault` were all present and visible
  - no obvious blank or detached shell/body regression was observed
  - extra workspace/chat chrome remained visible during the headless check
