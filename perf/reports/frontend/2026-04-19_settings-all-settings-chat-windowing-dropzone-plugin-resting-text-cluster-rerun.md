# Settings All Settings Chat-Windowing/Dropzone/Plugin Resting-Text Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-gen-python-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-chat-windowing-dropzone-plugin-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded dense-scene product slice on the remaining shared pure-text `7`-row cluster by moving `settings-section__chatWindowing`, `settings-section__dropzoneParamCodeObjDefault`, and `settings-section__pluginSectionDefault` onto the shared canvas-owned resting-text path, then rerun the normalized `All Settings` baseline to capture the post-slice dense metrics.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3069/`
  - backend: `http://127.0.0.1:8069`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__chatWindowing`
- Sibling sections landed in the same shared slice:
  - `settings-section__dropzoneParamCodeObjDefault`
  - `settings-section__pluginSectionDefault`
- Canonical target rows:
  - `settings-section__chatWindowing`:
    - input id: `settings-section__chatWindowing-settings-codeobj__chatWindowing__chatWindowing__shortcuts__canvasToggle-ParamInput`
  - `settings-section__dropzoneParamCodeObjDefault`:
    - input id: `settings-section__dropzoneParamCodeObjDefault-settings-codeobj__dropzoneParamCodeObjDefault__dropzoneParamCodeObjDefault__placeholder-ParamInput`
  - `settings-section__pluginSectionDefault`:
    - input id: `settings-section__pluginSectionDefault-settings-codeobj__pluginSectionDefault__pluginSectionDefault__size__width-ParamInput`
- Authentication:
  - probes used fresh one-shot bootstrap tokens from `./scripts/dev-runtime-info.sh`
- Lifecycle note:
  - the first live Playwright attempt hit a harness-level auth-cookie prefix mismatch after a bounded `./aireset.sh` recovery, so the final focused probe and dense rerun were executed directly against the recovered `3069` / `8069` runtime with fresh tokens and no `SETTA_AUTH_COOKIE_NAME` override

## Implementation Summary

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now includes `settings-section__chatWindowing`, `settings-section__dropzoneParamCodeObjDefault`, and `settings-section__pluginSectionDefault` in the shared resting-text-owned section set and gives all three sections lightweight underline ownership.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures those three sections directly so the retained scene can paint their resting text and underline primitives without adding another renderer branch.
- Focused coverage now exists at:
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - new `frontend/tests/e2e/settings/settings-all-settings-chat-windowing-dropzone-plugin-resting-text-cluster.spec.ts`

## Focused Browser Inventory

A fresh post-change triple probe recorded:

- `settings-section__chatWindowing`:
  - total unique `*-ParamInput` roots: `7`
  - `data-canvas-owned-resting-text="true"` roots: `8`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `7`
  - `data-canvas-owned-underline="true"` roots: `7`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`
- `settings-section__dropzoneParamCodeObjDefault`:
  - total unique `*-ParamInput` roots: `7`
  - `data-canvas-owned-resting-text="true"` roots: `8`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `7`
  - `data-canvas-owned-underline="true"` roots: `7`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`
- `settings-section__pluginSectionDefault`:
  - total unique `*-ParamInput` roots: `7`
  - `data-canvas-owned-resting-text="true"` roots: `8`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `7`
  - `data-canvas-owned-underline="true"` roots: `7`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`

Interpretation:

- the full untouched `7`-row chat-windowing/dropzone/plugin cluster now rides the shared lightweight resting-text path
- the focused counts show every target `*-ParamInput` root moved onto the lightweight path with no live editors left mounted at rest
- `canvasOwnedRestingTextCount` is higher than the target-row count because each section still has one pre-existing non-lightweight canvas-owned text root elsewhere in the section, not because the target rows stayed live

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7701`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `103.53ms`
- RAF p50: `100ms`
- RAF p95: `200.1ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `178`
- RAF frames over `33.3ms`: `156`
- Long-task count: `127`
- Long-task total: `16599ms`
- Long-task max: `238ms`

## Comparison Vs. Prior Dense Report

- Document nodes: up `31` (`7670` -> `7701`)
- Inputs: up `2` (`2` -> `4`)
- Textareas: up `1` (`0` -> `1`)
- Buttons: up `14` (`39` -> `53`)
- RAF mean: worse by `0.93ms` (`102.6ms` -> `103.53ms`)
- RAF p95: worse by `16.7ms` (`183.4ms` -> `200.1ms`)
- Long-task total: worse by `89ms` (`16510ms` -> `16599ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1852` (`9553` -> `7701`)
- Inputs: down `88` (`92` -> `4`)
- Textareas: unchanged (`1` -> `1`)
- Buttons: down `468` (`521` -> `53`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `101.4ms` (`204.93ms` -> `103.53ms`)
- RAF p95: better by `16.6ms` (`216.7ms` -> `200.1ms`)
- Long-task total: better by `19738ms` (`36337ms` -> `16599ms`)

## Interpretation

- The deterministic section-scoped probe is clean: the remaining shared `7`-row chat-windowing/dropzone/plugin cluster now rests as canvas-owned text with inline editor activation still preserved on first focus.
- The dense rerun after the bounded lifecycle recovery is useful as a smoke measurement, but not a clean apples-to-apples benchmark versus the prior dense report because the recovered session reopened extra non-target workspace chrome. Treat the section-scoped ownership move as the authoritative proof for this slice, and treat the global `documentNodeCount` / `inputCount` / `buttonCount` deltas here as potentially contaminated by that workspace-state noise.
- Even with that caveat, the branch still owes a materially better dense-scene motion result. This slice closes another real mounted row-value cluster, not the overall performance goal.

## Verification

- Unit tests:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-chat-windowing-dropzone-plugin-resting-text-cluster.spec.ts`
- Live Playwright probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/.)" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="http://127.0.0.1:3069/" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-chat-windowing-dropzone-plugin-resting-text-cluster.spec.ts --reporter=line --workers=1`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/.)" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="http://127.0.0.1:3069/" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Results:
  - `1 passed (57.2s)` for the focused cluster probe on the recovered live runtime
  - `1 passed (41.4s)` for the dense baseline rerun on the recovered live runtime
  - the focused probe confirmed the chat-windowing/dropzone/plugin cluster rests as lightweight canvas-owned text and all three canonical rows still mount inline editors on first focus
  - the dense probe emitted the metrics recorded above
