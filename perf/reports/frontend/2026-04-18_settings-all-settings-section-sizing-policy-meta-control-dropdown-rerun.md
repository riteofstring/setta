# Settings All Settings Section Sizing Policy Meta-Control Dropdown Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `b85e873b5` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-resting-text-rerun.md`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after moving the repeated `settings-section__sectionSizingPolicy` size-mode meta-control dropdown rows to a lightweight canvas-owned resting path that keeps the real combobox mounted only on activation.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-025/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Measurement Method

This rerun uses the same normalized dense-scene baseline probe as the earlier 2026-04-18 reports:

1. Boot the current dev app with authenticated Playwright state.
2. Navigate to `/settings`.
3. Switch to `All Settings`.
4. Trigger one shared React Flow `fit view` and wait until more than `20` visible nodes are mounted.
5. Sample DOM counts on the live page.
6. Apply the deterministic `180`-frame scripted transform loop directly to `.react-flow__viewport`.
7. Measure frame deltas from `requestAnimationFrame` and long tasks from `PerformanceObserver`.
8. Restore the original viewport transform and emit the metrics payload.

The normalized start/end viewport remained `x=759.9`, `y=-51.75`, `zoom=0.1`, so this rerun stays comparable to the prior dense-scene reports.

## Captured Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `9151`
- Inputs: `60`
- Textareas: `0`
- Buttons: `477`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.75`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.75`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `109.59ms`
- RAF p50: `100.1ms`
- RAF p95: `216.6ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `155`
- Long-task count: `127`
- Long-task total: `17680ms`
- Long-task max: `253ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Comparison Vs. Prior Section Sizing Policy Resting Text Rerun

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: down `30` (`9181` -> `9151`)
- Inputs: down `30` (`90` -> `60`)
- Textareas: unchanged at `0`
- Buttons: down `30` (`507` -> `477`)
- Canvas elements: unchanged at `1`
- CodeMirror editors: unchanged at `0`
- RAF mean: improved by `4.65ms` (`114.24ms` -> `109.59ms`)
- RAF p95: improved by `0.1ms` (`216.7ms` -> `216.6ms`)
- RAF max: worse by `16.7ms` (`233.3ms` -> `250ms`)
- Long-task count: down `11` (`138` -> `127`)
- Long-task total: improved by `1159ms` (`18839ms` -> `17680ms`)
- Long-task max: worse by `18ms` (`235ms` -> `253ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `402` (`9553` -> `9151`)
- Inputs: down `32` (`92` -> `60`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `44` (`521` -> `477`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: improved by `95.34ms` (`204.93ms` -> `109.59ms`)
- RAF p95: improved by `0.1ms` (`216.7ms` -> `216.6ms`)
- RAF max: improved by `66.7ms` (`316.7ms` -> `250ms`)
- Long-task count: down `54` (`181` -> `127`)
- Long-task total: improved by `18657ms` (`36337ms` -> `17680ms`)
- Long-task max: improved by `48ms` (`301ms` -> `253ms`)

## Interpretation

- This slice finally moved a repeated non-text inactive control family on the dense `settings-section__sectionSizingPolicy` lane instead of extending another text-only rollout.
- The DOM-node delta is modest (`30`), but the more important dense-scene ownership win is that the normalized surface now mounts `30` fewer live inputs and `30` fewer live buttons because the closed size-mode combobox family no longer keeps real Downshift search controls mounted at rest.
- Motion also improved slightly on this rerun, so the lightweight dropdown path did not trade away the retained-canvas gains already established on the lane.
- Dense `All Settings` still mounts more than `9.1k` DOM nodes and `477` buttons, so the next real frontier should stay on `settings-section__sectionSizingPolicy` and attack the next repeated inactive control subtree rather than reopening old callable/dict/globalVariables chrome lanes.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Utils/Combobox/ComboboxParts.test.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/ConfiguredParamInputs.tsx src/components/Params/ParamUIs/DropdownInput.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.tsx src/components/Utils/Combobox/ComboboxParts.tsx src/components/Utils/Combobox/ComboboxParts.test.tsx src/components/Utils/Combobox/IdNameCombobox.tsx src/components/Utils/Combobox/useIdNameCombobox.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
- Playwright canary:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-025/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-025/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - passed locally on 2026-04-18
  - emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration status summary
