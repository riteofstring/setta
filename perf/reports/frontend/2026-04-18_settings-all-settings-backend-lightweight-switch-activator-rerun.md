# Settings All Settings Backend Lightweight Switch Activator Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `510d495a2` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-backend-lightweight-resting-dropdown-rerun.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-backend-lightweight-switch.spec.ts`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after replacing the backend section's live switch `button` roots with a lightweight role-switch activator on the canvas-shell path, so the `settings-section__backend` switch family no longer contributes nine live button nodes at rest.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.jfU8NM/loop-001/run-002/worktree-ai.log)" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="http://127.0.0.1:3068/" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

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

The normalized start/end viewport remained `x=759.9`, `y=-51.75`, `zoom=0.1`, so this rerun stays comparable to the earlier dense-scene reports.

## Captured Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `8182`
- Inputs: `55`
- Textareas: `0`
- Buttons: `463`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.75`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.75`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `102.98ms`
- RAF p50: `100ms`
- RAF p95: `200ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `176`
- RAF frames over `33.3ms`: `157`
- Long-task count: `128`
- Long-task total: `16654ms`
- Long-task max: `241ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Comparison Vs. Prior Backend Lightweight Resting Dropdown Rerun

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: unchanged at `8182`
- Inputs: unchanged at `55`
- Textareas: unchanged at `0`
- Buttons: down `9` (`472` -> `463`)
- Canvas elements: unchanged at `1`
- CodeMirror editors: unchanged at `0`
- RAF mean: effectively unchanged (`102.7ms` -> `102.98ms`)
- RAF p95: better by `16.6ms` (`216.6ms` -> `200ms`)
- RAF max: better by `16.6ms` (`250ms` -> `233.4ms`)
- Long-task count: up `1` (`127` -> `128`)
- Long-task total: worse by `142ms` (`16512ms` -> `16654ms`)
- Long-task max: better by `2ms` (`243ms` -> `241ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1371` (`9553` -> `8182`)
- Inputs: down `37` (`92` -> `55`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `58` (`521` -> `463`)
- Canvas elements: up `1` (`0` -> `1`)
- CodeMirror editors: unchanged at `0`
- RAF mean: better by `101.95ms` (`204.93ms` -> `102.98ms`)
- Long-task total: better by `19683ms` (`36337ms` -> `16654ms`)

## Structural Contract

- `settings-section__backend` now mounts `9` lightweight backend switches with `data-canvas-owned-lightweight-switch="true"` and `role="switch"` at rest.
- Those owned rows no longer mount any `button[role="switch"]` nodes at rest inside the backend section.
- The target `Autosave` row still toggles on the first click and restores to its original `aria-checked` / `data-state` value on the second click.

## Interpretation

- This slice follows the post-dropdown inventory instead of reopening the closed callable, dict, GlobalVariables, `sectionSizingPolicy`, `gui`, or backend-dropdown lanes.
- The dense-scene DOM count stayed flat, so this is not a new motion win on its own.
- The real payoff is on the remaining interactive-core plateau: backend switches no longer consume `button` roots at rest, which moves the global `All Settings` button count from `472` to `463` without adding a new renderer seam or a second click.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/SwitchInput.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-backend-lightweight-switch.spec.ts`
- Playwright canary:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.jfU8NM/loop-001/run-002/worktree-ai.log)" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="http://127.0.0.1:3068/" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-backend-lightweight-switch.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.jfU8NM/loop-001/run-002/worktree-ai.log)" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="http://127.0.0.1:3068/" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - passed locally on 2026-04-18
  - emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary and caveats
