# Settings All Settings Lightweight Color-Input Value-Shell Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-19_settings-all-settings-backend-resting-text-rerun.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts`
Ranking probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one stronger shared row-body/value-shell reduction after the backend plain-text slice by reusing the lightweight no-choice color activator as the value-shell root on the canvas path, so the remaining `div.section-value.single-cell-container` wrapper and stray `gg-color-picker` icon shell stop surviving as separate DOM on `All Settings`.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap tokens from `./scripts/dev-runtime-info.sh`
- Commands:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Runtime Proof

- Canonical target section: `settings-section__gui`
- Sibling proof sections:
  - `settings-section__colorPickerParamCodeObjDefault`
  - `settings-section__drawSectionDefault`
- Focused canary attachment state on the live worktree surface:
  - `settingsLightweightColorCount: 6`
  - `settingsNativeColorInputCount: 0`
  - `settings-section__gui` now reports:
    - `lightweightColorCount: 4`
    - `rootsUsingValueShellCount: 4`
    - `rootsWithSeparateValueShellCount: 0`
    - `strayColorIconCount: 0`
  - `settings-section__colorPickerParamCodeObjDefault` now reports:
    - `lightweightColorCount: 1`
    - `rootsUsingValueShellCount: 1`
    - `rootsWithSeparateValueShellCount: 0`
    - `strayColorIconCount: 0`
  - `settings-section__drawSectionDefault` now reports:
    - `lightweightColorCount: 1`
    - `rootsUsingValueShellCount: 1`
    - `rootsWithSeparateValueShellCount: 0`
    - `strayColorIconCount: 0`
  - the sampled GUI activator remained a `DIV[role="button"]`
  - first-click activation on the GUI color control still mounted one inline `input[type="color"]` in place and blur restored the lightweight root

## Fresh Ranking

- Post-slice remaining value surface:
  - `mountedSectionCount: 46`
  - `totalRowCount: 759`
  - `totalRemainingValueRowCount: 12`
  - `totalRemainingValueElementCount: 15`
- Top remaining sections after this slice:
  1. `settings-section__backend`
     - `remainingValueElementCount: 9`
     - `remainingValueRowCount: 9`
     - every listed survivor row is already `lightweightSwitch`, with only `div.section-value` still left in DOM
  2. `settings-section__nestedParamCodeObjDefault`
     - `remainingValueElementCount: 6`
     - `remainingValueRowCount: 3`
     - this is now the highest non-lightweight text/value survivor family
- Consequence:
  - `settings-section__gui` fell from `8` remaining value elements across `4` rows to `0`
  - `settings-section__drawSectionDefault` also fell to `0`
  - the remaining whole-scene value surface is now concentrated in backend switch rows plus the nested-param text/value family

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6709`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `94.6ms`
- RAF p50: `83.4ms`
- RAF p95: `183.3ms`
- RAF max: `233.3ms`
- RAF frames over `16.7ms`: `176`
- RAF frames over `33.3ms`: `152`
- Long-task count: `128`
- Long-task total: `15114ms`
- Long-task max: `229ms`

## Comparison Vs. Prior Backend Resting Text Rerun

- Total remaining value rows: down `6` (`18` -> `12`)
- Total remaining value elements: down `12` (`27` -> `15`)
- Document nodes: up slightly (`6704` -> `6709`)
- Inputs: unchanged at `4`
- Buttons: up slightly (`52` -> `53`)
- RAF mean: slightly worse (`94.22ms` -> `94.6ms`)
- RAF p95: effectively flat (`183.4ms` -> `183.3ms`)
- Long-task total: slightly worse (`15021ms` -> `15114ms`)

## Interpretation

- This is the bounded shared color-input row-body/value-shell pass the current plan called for, not another section-local text or wrapper cleanup.
- The surviving GUI/meta-control/draw color-input row-body surface is now gone from the remaining value ranking; the lightweight activator itself owns that shell.
- Dense motion still did not materially improve, so this pass confirms the current stop signal rather than reopening another survivor-family harvest.
- The next frontier should escalate to a stronger inactive-row body/overlay primitive from the whole-scene `All Settings` surface instead of another backend/gui/family cleanup hop by inertia.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamUIs/ColorPickerInput.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/ColorPickerInput.tsx src/components/Params/ParamUIs/ColorPickerInput.test.tsx tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts`
- Playwright canary:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts --reporter=line --workers=1`
- Playwright ranking probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all commands above passed locally on 2026-04-19
- CDP visual check:
  - done in a fresh headless DevTools sub-agent
  - `/settings` loaded with `All Settings` active and no visible crash/error overlay
  - one `.react-flow__section-shell-backdrop` wrapper was present with exactly one retained canvas inside it
  - `settings-section__gui`, `settings-section__colorPickerParamCodeObjDefault`, and `settings-section__drawSectionDefault` were present on the live surface/DOM
  - activating the GUI `gridColor` lightweight color control mounted one inline `input[type="color"]` in place with no obvious blank or detached jump
  - caveat: in this build the retained canvas is identified via `data-testid="react-flow__section-shell-backdrop-canvas"` under the backdrop wrapper rather than a dedicated canvas class selector
