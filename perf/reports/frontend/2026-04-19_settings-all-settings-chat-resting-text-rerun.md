# Settings All Settings Chat Resting-Text Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-draw-resting-text-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded dense-scene product slice on the next highest-payoff untouched text/value section family by moving `settings-section__chatSectionDefault` onto the shared canvas-owned resting-text path, then rerun the normalized `All Settings` baseline to see whether that section reduces the moving row-value DOM surface.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__chatSectionDefault`
- Canonical target row:
  - id: `ParamContainer-settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode`
  - input id: `settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode-ParamInput`
- Authentication:
  - probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh` and `./scripts/dev-runtime-info.sh`

## Implementation Summary

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats `settings-section__chatSectionDefault` as a shared resting-text-owned section and gives that lane lightweight underline ownership.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures `settings-section__chatSectionDefault` directly so the retained scene can paint its resting text and underline primitives.
- Focused coverage now exists at:
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - new `frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts`

## Focused Chat Inventory

A fresh post-change inventory probe on `settings-section__chatSectionDefault` recorded:

- section present: `true`
- total `*-ParamInput` roots: `13`
- `data-canvas-owned-resting-text="true"` roots: `14`
- `data-canvas-owned-resting-text-lightweight="true"` roots: `13`
- `data-canvas-owned-underline="true"` roots: `13`
- total `.cm-line span` highlight nodes across that section: `0`

Interpretation:

- all thirteen text/value `ParamInput` roots in the chat section now ride the shared lightweight resting-text path
- the extra non-lightweight `data-canvas-owned-resting-text="true"` root is the pre-existing `#settings-section__chatSectionDefault-args-filter` filter activator, not a new live text-editor survivor
- this was the top untouched text/value section from the fresh post-draw inventory, so it still qualifies as a real dense body/value move rather than another closed activator hop

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7899`
- Inputs: `2`
- Textareas: `0`
- Buttons: `39`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `101.3ms`
- RAF p50: `100ms`
- RAF p95: `216.7ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `176`
- RAF frames over `33.3ms`: `156`
- Long-task count: `125`
- Long-task total: `16190ms`
- Long-task max: `250ms`

## Comparison Vs. Prior Draw Dense Report

- Document nodes: down `38` (`7937` -> `7899`)
- Inputs: unchanged (`2`)
- Buttons: unchanged (`39`)
- RAF mean: worse by `0.28ms` (`101.02ms` -> `101.3ms`)
- RAF p95: worse by `33.3ms` (`183.4ms` -> `216.7ms`)
- Long-task total: better by `80ms` (`16270ms` -> `16190ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1654` (`9553` -> `7899`)
- Inputs: down `90` (`92` -> `2`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `482` (`521` -> `39`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `103.63ms` (`204.93ms` -> `101.3ms`)
- RAF p95: unchanged (`216.7ms`)
- Long-task total: better by `20147ms` (`36337ms` -> `16190ms`)

## Interpretation

- This slice moved the dense mounted row-value surface again: the top untouched chat family now rides the retained-canvas path and the global `documentNodeCount` dropped from `7937` to `7899`.
- The motion numbers remain noisy and still poor in absolute terms, so treat this as another real DOM-cost reduction prerequisite, not as proof that the branch has solved dense-scene motion.
- The next frontier should continue on the same problem class:
  - the next untouched text/value family if one still clearly leads the remaining inventory
  - or a broader shared resting-value primitive only if it now dominates the remaining `9`-row cluster
- Do not reopen the closed kwargs/menu/filter/color/dropdown/switch/shortcuts/draw/chat lanes from this state.

## Verification

- Unit tests:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts`
- Live Playwright probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-006/worktree-ai.log -- tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Results:
  - `2 passed (1.0m)` on the live worktree runtime
  - the focused probe confirmed the canonical `Permission Mode` row rests as lightweight canvas-owned text and still activates the inline CodeMirror editor on first focus
  - the dense probe emitted the metrics recorded above
