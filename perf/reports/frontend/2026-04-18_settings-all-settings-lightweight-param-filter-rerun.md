# Settings All Settings Lightweight Param Filter Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `e88979620` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-lightweight-section-menu-trigger-rerun.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-lightweight-param-filters.spec.ts`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after replacing the repeated per-section kwargs/filter inputs with lightweight retained-canvas activators on the canvas path.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.G3F2Nh/loop-001/run-001/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-lightweight-param-filters.spec.ts tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

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
- Inputs: `9`
- Textareas: `0`
- Buttons: `40`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `102.42ms`
- RAF p50: `100ms`
- RAF p95: `200ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `178`
- RAF frames over `33.3ms`: `154`
- Long-task count: `128`
- Long-task total: `16512ms`
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

## Comparison Vs. Prior Lightweight Section Menu Trigger Rerun

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: unchanged at `8182`
- Inputs: down `46` (`55` -> `9`)
- Textareas: unchanged at `0`
- Buttons: unchanged at `40`
- Canvas elements: unchanged at `1`
- CodeMirror editors: unchanged at `0`
- RAF mean: better by `1.49ms` (`103.91ms` -> `102.42ms`)
- RAF p95: unchanged at `200ms`
- RAF max: unchanged at `233.4ms`
- Long-task count: worse by `1` (`127` -> `128`)
- Long-task total: better by `217ms` (`16729ms` -> `16512ms`)
- Long-task max: worse by `9ms` (`239ms` -> `248ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1371` (`9553` -> `8182`)
- Inputs: down `83` (`92` -> `9`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `481` (`521` -> `40`)
- Canvas elements: up `1` (`0` -> `1`)
- CodeMirror editors: unchanged at `0`
- RAF mean: better by `102.51ms` (`204.93ms` -> `102.42ms`)
- RAF p95: better by `16.7ms` (`216.7ms` -> `200ms`)
- Long-task total: better by `19825ms` (`36337ms` -> `16512ms`)

## Structural Contract

- Canonical target section for this shared lane: `settings-section__callableSectionDefault`.
- Canonical target filter id: `settings-section__callableSectionDefault-args-filter`.
- A post-change live inventory on the dense `All Settings` surface now shows:
  - `46` settings sections mounted
  - `46` lightweight roots with `data-canvas-owned-lightweight-filter-activator="true"`
  - `0` live `input[id$="-args-filter"]` roots across those settings sections at rest
- First interaction still works on the live canary:
  - at rest the callable kwargs/filter row renders as a lightweight `searchbox` activator
  - focusing or clicking that activator swaps in the live inline `input` immediately
  - blurring the live inline editor restores the lightweight activator in the same wrapper
- The old dict/globalVariables filter-icon and underline ownership path still survives this shared change:
  - the existing dict shared-chrome canary passed unchanged in the same live Playwright run

## Post-Filter Inventory

The fresh graph-surface-only inventory after this slice leaves one clear next frontier:

- Remaining graph-surface live inputs:
  - `6` `input[type="color"]` roots
  - section distribution:
    - `settings-section__gui`: `4`
    - `settings-section__colorPickerParamCodeObjDefault`: `1`
    - `settings-section__drawSectionDefault`: `1`
- Remaining graph-surface live combobox/search core:
  - `1` text input with `placeholder="Search"` and `role="combobox"`
  - `1` companion button
  - both in `settings-section__stateMachineGateSectionDefault`

## Interpretation

- This is the next shared value/editor slice after the section-menu-trigger cleanup.
- The dense-scene DOM node plateau stayed flat, but the global live input plateau collapsed from `55` to `9`.
- The largest remaining graph-surface survivor is now a shared color-input family, not another filter, switch, kwargs, or menu-trigger lane.
- Absolute dense-scene performance is still not good enough; this is another plateau reduction step, not proof that the branch is done.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/SectionParts/CanvasOwnedParamFilterActivator.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/SectionParts/KwargsControls.tsx src/components/Section/SectionParts/CanvasOwnedParamFilterActivator.tsx src/components/Section/SectionParts/CanvasOwnedParamFilterActivator.test.tsx tests/e2e/settings/settings-all-settings-lightweight-param-filters.spec.ts`
- Playwright canaries + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.G3F2Nh/loop-001/run-001/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-lightweight-param-filters.spec.ts tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - Vitest passed locally on 2026-04-18
  - Eslint passed locally on 2026-04-18
  - Playwright canaries passed locally on 2026-04-18
  - Playwright dense probe passed locally on 2026-04-18 and emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary and caveats
