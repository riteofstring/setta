# Settings All Settings Motion Shell Handoff Rerun

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`
Sibling proof sections:
- `settings-section__promptSectionDefault`
- `settings-section__languageServer`

## Summary

Land a stronger motion-time structural reduction on the existing resting-text motion-hidden boundary: while `viewportInteractionActive` is true on inactive sections, keep the section root mounted but hand shell/header fill to the retained canvas and make the DOM surface transparent.

## Implementation

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - resolves one shared motion-hidden canvas state on the existing resting-text boundary
  - passes the same state to `CustomResizable` and `CanvasSectionBody`
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - exposes `data-canvas-owned-motion-shell-root="true"` on participating sections
  - exposes `data-canvas-owned-motion-shell-hidden="true"` while the inactive motion shell is active
  - switches the DOM surface to transparent/borderless while the retained canvas paints the shell
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`
  - paints full shell/header chrome for motion-hidden resting-text sections during viewport interaction instead of limiting those sections to detail text/boxes only
- Focused proof:
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`

## Runtime Proof

- Blank pane point: `x=24`, `y=60`
- Initial motion overlay state on the live worktree runtime:
  - `hiddenBodyCount: 0`
  - `hiddenHeaderControlsCount: 0`
  - canonical sections each reported:
    - `motionShellRoot: true`
    - `motionShellHidden: false`
    - `backgroundColor: rgb(16, 20, 27)`
    - `childElementCount: 2`
- During one renderer wheel zoom interaction:
  - `hiddenBodyCount: 45`
  - `hiddenHeaderControlsCount: 45`
  - canonical sections each reported:
    - `motionShellRoot: true`
    - `motionShellHidden: true`
    - `backgroundColor: rgba(0, 0, 0, 0)`
    - `data-canvas-owned-motion-body-hidden="true"`
    - `childElementCount: 0`
- After the interaction settled:
  - `hiddenBodyCount: 0`
  - `hiddenHeaderControlsCount: 0`
  - canonical sections restored:
    - `motionShellHidden: false`
    - `backgroundColor: rgb(16, 20, 27)`
    - `childElementCount: 2`

## Dense Companion Rerun

- `documentNodeCount: 5584`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 60`
- `raf.meanMs: 130.39`
- `raf.p95Ms: 116.7`
- `longTasks.totalMs: 17604`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- This is a real renderer-side structural reduction on the canonical motion lane, not another header-chrome harvest: inactive motion-hidden sections now hand shell/header paint to the retained canvas while keeping only the section root mounted in DOM.
- The dense rerun stayed noisy-to-worse on this runtime family, so treat this as ownership proof rather than a clean motion win.
- The next real frontier should stay on `settings-section__browserSectionDefault` and target the remaining hidden-section subtree/layout cost beyond this shell handoff instead of reopening menu/header micro-slices.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: `1 passed (11 tests)`
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Utils/Resizable/CustomResizable.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-005/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.1m)`
- CDP visual check: done (`/settings` loaded with `All Settings` active, `fit view` plus one `zoom in` kept exactly one retained canvas mounted, and `browserSectionDefault` / `promptSectionDefault` / `languageServer` showed no obvious blank or detached shell/header artifact`)
