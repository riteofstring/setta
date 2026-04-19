# Settings All Settings Lightweight Switch Resting-Visual Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-color-input-value-shell-rerun.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
Ranking probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one stronger shared inactive-row primitive by moving lightweight switch resting visuals onto the retained canvas across the shared settings/resting-text boundary, instead of doing another section-specific wrapper flattening pass.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap tokens from `./scripts/dev-runtime-info.sh`
- Commands:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Runtime Proof

- Canonical target section: `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__gui`
- Additional negative/edge proof sections:
  - `settings-section__backend`
  - `settings-section__callableSectionDefault`
- Focused canary attachment state on the live worktree surface:
  - `settingsLightweightSwitchCount: 156`
  - `settingsCanvasTrackSwitchCount: 155`
  - `settingsCanvasThumbCount: 155`
  - the only remaining non-canvas-owned lightweight switch is outside the shared retained resting-text boundary
  - `settings-section__browserSectionDefault` target row `Aspect Ratio` now reports:
    - `targetCanvasTrack: "true"`
    - `targetCanvasThumbCount: 1`
    - `targetRootBackgroundColor: "rgba(0, 0, 0, 0)"`
    - `targetThumbBackgroundColor: "rgba(0, 0, 0, 0)"`
    - `targetValueShellWrapperCount: 0`
  - `settings-section__promptSectionDefault` sibling row still reports:
    - `siblingRootIsValueShell: true`
    - `siblingSectionLightweightSwitchCount: 4`
    - `siblingValueShellWrapperCount: 0`
  - `settings-section__gui` still reports:
    - `guiRootIsValueShell: true`
    - `guiSectionLightweightSwitchCount: 7`
    - `guiValueShellWrapperCount: 0`
  - `settings-section__backend` now reports:
    - `backendCanvasTrack: "true"`
    - `backendCanvasThumbCount: 1`
    - `backendSectionLightweightSwitchCount: 9`
    - `backendValueShellWrapperCount: 1`
    - `backendValueShellWrapperOpacity: "0"`
    - `backendThumbBackgroundColor: "rgba(0, 0, 0, 0)"`
  - `settings-section__callableSectionDefault` still preserves shell-owned switch chrome proof:
    - `callableCanvasTrackSwitchCount: 6`
  - first-click toggle on the browser `Aspect Ratio` lightweight switch still changed `aria-checked` and `data-state`, then toggled back successfully

## Fresh Ranking

- Post-slice remaining value surface:
  - `mountedSectionCount: 46`
  - `totalRowCount: 759`
  - `totalRemainingValueRowCount: 3`
  - `totalRemainingValueElementCount: 6`
- Top remaining section after this slice:
  1. `settings-section__nestedParamCodeObjDefault`
     - `remainingValueElementCount: 6`
     - `remainingValueRowCount: 3`
     - remaining rows:
       - `coreNameType` with `div.section-value.peer/textinput`, `div.cm-line`, and `span.section-value`
       - `typeAnnotation` with `span.section-value.peer/textinput` and `span.section-value`
       - `coreNameEditable` with one remaining `div.section-value`
- Consequence:
  - `settings-section__backend` dropped out of the ranking completely
  - the whole-scene remaining visible value surface moved from `15` elements across `12` rows to `6` elements across `3` rows
  - the only visible survivor family is now the nested-param section, including the one lightweight switch that stays outside the current retained resting-text boundary

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6679`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `106.61ms`
- RAF p50: `83.4ms`
- RAF p95: `249.9ms`
- RAF max: `1033.3ms`
- RAF frames over `16.7ms`: `175`
- RAF frames over `33.3ms`: `154`
- Long-task count: `130`
- Long-task total: `16865ms`
- Long-task max: `765ms`

## Comparison Vs. Prior Lightweight Color-Input Rerun

- Total remaining value rows: down `9` (`12` -> `3`)
- Total remaining value elements: down `9` (`15` -> `6`)
- Document nodes: down slightly (`6709` -> `6679`)
- Inputs: unchanged at `4`
- Buttons: down slightly (`53` -> `52`)
- RAF mean: worse (`94.6ms` -> `106.61ms`)
- RAF p95: worse (`183.3ms` -> `249.9ms`)
- Long-task total: worse (`15114ms` -> `16865ms`)

## Interpretation

- This is a real shared resting-switch visual primitive, not another family-specific text/value harvest:
  - the retained scene now owns the resting switch track and thumb for `155` lightweight switches on the checked `All Settings` surface
  - the backend survivor family is no longer visible in the ranking because its remaining wrapper shell is now transparent while the switch visual is painted on canvas
- The slice did reduce whole-scene visible value surface substantially, but dense motion still failed to improve and regressed on this runtime family.
- Per the current plan checkpoint, this means the branch should not spend another iteration on switch-family follow-ups or other small survivor harvests by inertia.
- The next default frontier must escalate to a larger inactive-row body/overlay decision centered on the remaining nested-param text/value surface and the broader section-body motion cost.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/SwitchInput.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
- Playwright canary:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts --reporter=line --workers=1`
- Playwright ranking probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all commands above passed locally on 2026-04-19
  - dense motion remained worse than the prior checkpoint even though the shared switch visual surface moved to canvas
- CDP visual check:
  - done in a fresh headless DevTools sub-agent
  - `/settings` loaded with `All Settings` active and no visible crash/error overlay
  - one retained canvas was mounted
  - the backend, browser, gui, and callable sections were present
  - the relevant switch rows still looked visible and stable with no obvious blank or detached switch artifact
