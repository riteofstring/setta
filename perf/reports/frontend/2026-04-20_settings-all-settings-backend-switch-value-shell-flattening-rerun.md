# Settings All Settings Backend Switch Value-Shell Flattening Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `fb1cba42e` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior switch value-shell reference: `perf/reports/frontend/2026-04-19_settings-all-settings-shared-switch-value-shell-flattening-rerun.md`
Current dense motion reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused proof:
- `frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
- `frontend/tests/e2e/settings/settings-all-settings-backend-lightweight-switch.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`

## Goal

Finish the shared lightweight switch value-shell seam by flattening the remaining backend-only `div.section-value` wrapper, while keeping backend switches on the existing first-click lightweight activator path and canvas-owned track path.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - `isCanvasOwnedSectionLightweightSwitchValueShell(...)` now includes the backend settings section instead of treating it as the one remaining exception inside the retained resting-text boundary
- focused proof now expects backend switch rows to match the already-flattened switch sections:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__backend`
- Focused backend proof row:
  - `settings-codeobj__backend__backend__autobackup`
- Shared sibling proof sections:
  - `settings-section__browserSectionDefault`
  - `settings-section__promptSectionDefault`
  - `settings-section__gui`
- Commands:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-007/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts frontend/tests/e2e/settings/settings-all-settings-backend-lightweight-switch.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

## Focused Proof

- backend switch family state on the live worktree surface:
  - `backendSectionLightweightSwitchCount: 9`
  - `backendCanvasTrack: "true"`
  - `backendCanvasThumbCount: 1` on the focused `autobackup` row
  - `backendRootIsValueShell: true`
  - `backendValueShellWrapperCount: 0`
  - `backendThumbBackgroundColor: rgba(0, 0, 0, 0)`
- shared sibling proof remained aligned:
  - `browserSectionDefault`, `promptSectionDefault`, and `gui` switch rows each still report `rootIsValueShell: true`
  - whole-scene switch inventory on the focused rerun stayed lightweight/canvas-owned:
    - `settingsLightweightSwitchCount: 156`
    - `settingsCanvasTrackSwitchCount: 156`
    - `settingsCanvasThumbCount: 156`
    - `settingsButtonSwitchCount: 0`
- focused interaction proof:
  - the backend family Playwright probe kept all `9` backend switch rows on the lightweight `role="switch"` path with `button[role="switch"]` count `0`
  - first-click toggle still worked on `settings-codeobj__backend__backend__autosave`

## Fresh Dense Metrics

- `documentNodeCount: 5570`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 59`
- `raf.meanMs: 125.63`
- `raf.p95Ms: 133.3`
- `longTasks.totalMs: 17079`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`:

- `documentNodeCount: 5579 -> 5570`
- `buttonCount: 59 -> 59`
- `raf.meanMs: 130.39 -> 125.63`
- `raf.p95Ms: 116.7 -> 133.3`
- `longTasks.totalMs: 17889 -> 17079`

## Interpretation

- This is a real product ownership cut, not another forwarding hop: backend lightweight switches now match the already-flattened retained resting-text switch family instead of carrying one backend-only layout wrapper.
- The focused proof is clean. Backend switches stay lightweight, canvas-owned, and first-click interactive while the redundant backend wrapper count drops from `1` to `0`.
- The dense-scene readout improved only modestly and not cleanly enough to claim a meaningful motion breakthrough. Mean frame time and long-task total moved in the right direction against the latest hotspot report, but `p95` remained far above budget and regressed versus that comparison point.
- Treat this as closing the backend exception on the shared switch value-shell seam, not as evidence that another switch-family micro-pass will solve dense `All Settings` motion. The next default frontier should stay on a broader row-body / inactive-overlay primitive or a renderer-main hotspot reduction, not another backend-only survivor harvest.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - result: `2 passed (73 tests)`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
  - result: passed
- Playwright focused + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-007/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts frontend/tests/e2e/settings/settings-all-settings-backend-lightweight-switch.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `3 passed (1.4m)`
- CDP visual check:
  - required for this frontend slice; see the refreshed handoff/history for the iteration summary
