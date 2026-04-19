# Settings All Settings Lightweight Color Input Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `84a8a8b5d` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-lightweight-param-filter-rerun.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after replacing the remaining shared native `input[type="color"]` family with lightweight retained-canvas activators on the canvas path.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.G3F2Nh/loop-001/run-002/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Measurement Method

This rerun uses the same normalized dense-scene baseline probe as the earlier 2026-04-18 retained-canvas reports:

1. Boot the current dev app with authenticated Playwright state.
2. Navigate to `/settings`.
3. Switch to `All Settings`.
4. Trigger one shared React Flow `fit view` and wait until more than `20` visible nodes are mounted.
5. Sample DOM counts on the live page.
6. Apply the deterministic `180`-frame scripted transform loop directly to `.react-flow__viewport`.
7. Measure frame deltas from `requestAnimationFrame` and long tasks from `PerformanceObserver`.
8. Restore the original viewport transform and emit the metrics payload.

The normalized start/end viewport remained `x=759.9`, `y=-51.7`, `zoom=0.1`, so this rerun stays comparable to the earlier dense-scene reports.

## Captured Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `8182`
- Inputs: `3`
- Textareas: `0`
- Buttons: `40`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `102.88ms`
- RAF p50: `100ms`
- RAF p95: `200ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `177`
- RAF frames over `33.3ms`: `156`
- Long-task count: `127`
- Long-task total: `16522ms`
- Long-task max: `248ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Comparison Vs. Prior Lightweight Param Filter Rerun

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: unchanged at `8182`
- Inputs: down `6` (`9` -> `3`)
- Textareas: unchanged at `0`
- Buttons: unchanged at `40`
- Canvas elements: unchanged at `1`
- CodeMirror editors: unchanged at `0`
- RAF mean: worse by `0.46ms` (`102.42ms` -> `102.88ms`)
- RAF p95: unchanged at `200ms`
- RAF max: unchanged at `233.4ms`
- Long-task count: better by `1` (`128` -> `127`)
- Long-task total: worse by `10ms` (`16512ms` -> `16522ms`)
- Long-task max: unchanged at `248ms`

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1371` (`9553` -> `8182`)
- Inputs: down `89` (`92` -> `3`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `481` (`521` -> `40`)
- Canvas elements: up `1` (`0` -> `1`)
- CodeMirror editors: unchanged at `0`
- RAF mean: better by `102.05ms` (`204.93ms` -> `102.88ms`)
- RAF p95: better by `16.7ms` (`216.7ms` -> `200ms`)
- Long-task total: better by `19815ms` (`36337ms` -> `16522ms`)

## Structural Contract

- Canonical target section for this shared lane: `settings-section__gui`.
- A post-change live inventory on the dense `All Settings` surface now shows:
  - `0` live `input[type="color"]` roots across `section[data-section-id^="settings-section__"]` at rest
  - `6` lightweight roots with `data-canvas-owned-lightweight-color-input="true"` across those settings sections
  - section distribution:
    - `settings-section__gui`: `4`
    - `settings-section__colorPickerParamCodeObjDefault`: `1`
    - `settings-section__drawSectionDefault`: `1`
- First interaction still works on the live canary:
  - at rest the GUI section color controls render as lightweight `DIV[role="button"]` activators
  - activating one GUI activator swaps in a live inline `input[type="color"]` in the same section immediately
  - blurring that live inline input restores the lightweight activator in the same wrapper

## Post-Color Inventory

This slice closes the remaining shared native color-input family from the prior post-filter inventory.

The dense baseline now reports only `3` total live `input` roots on `All Settings`, so the next frontier should come from the residual non-color live editor/search core rather than another color-input follow-up. The previously identified `settings-section__stateMachineGateSectionDefault` combobox/search lane remains the most likely next product slice, but it should be re-inventoried on the fresh post-color surface before implementation if any ambiguity remains about the last `3` inputs.

## Interpretation

- This is another shared interactive-core plateau reduction, not a motion win.
- The dense-scene DOM node and button plateaus stayed flat, but the last shared native color-input family dropped out of the resting settings surface.
- Absolute dense-scene performance is still not good enough; the branch still owes a larger pan/zoom win after the remaining live editor/search survivors are addressed.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Params/ParamUIs/ColorPickerInput.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ConfiguredParamInputs.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Params/ParamUIs/ColorPickerInput.tsx src/components/Params/ParamUIs/ColorPickerInput.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.tsx src/components/Section/Layouts/DrawArea/DrawAreaControls.tsx tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts`
- Playwright canary + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.G3F2Nh/loop-001/run-002/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-lightweight-color-inputs.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - Vitest passed locally on 2026-04-18
  - Eslint passed locally on 2026-04-18
  - Playwright canary passed locally on 2026-04-18
  - Playwright dense probe passed locally on 2026-04-18 and emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary and caveats
