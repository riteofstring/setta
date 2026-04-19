# Settings All Settings Lightweight Section Menu Trigger Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `4a187556d` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-lightweight-switch-rerun.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-lightweight-section-menu-triggers.spec.ts`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after moving the repeated per-section header menu triggers off live `button[role="menuitem"]` roots on the retained-canvas path.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.jfU8NM/loop-001/run-005/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

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
- Buttons: `40`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.75`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.75`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `103.91ms`
- RAF p50: `100ms`
- RAF p95: `200ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `176`
- RAF frames over `33.3ms`: `154`
- Long-task count: `127`
- Long-task total: `16729ms`
- Long-task max: `239ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Comparison Vs. Prior Lightweight Switch Rerun

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: unchanged at `8182`
- Inputs: unchanged at `55`
- Textareas: unchanged at `0`
- Buttons: down `46` (`86` -> `40`)
- Canvas elements: unchanged at `1`
- CodeMirror editors: unchanged at `0`
- RAF mean: better by `1.21ms` (`105.12ms` -> `103.91ms`)
- RAF p95: unchanged at `200ms`
- RAF max: better by `49.9ms` (`283.3ms` -> `233.4ms`)
- Long-task count: better by `2` (`129` -> `127`)
- Long-task total: better by `246ms` (`16975ms` -> `16729ms`)
- Long-task max: better by `26ms` (`265ms` -> `239ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1371` (`9553` -> `8182`)
- Inputs: down `37` (`92` -> `55`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `481` (`521` -> `40`)
- Canvas elements: up `1` (`0` -> `1`)
- CodeMirror editors: unchanged at `0`
- RAF mean: better by `101.02ms` (`204.93ms` -> `103.91ms`)
- RAF p95: better by `16.7ms` (`216.7ms` -> `200ms`)
- Long-task total: better by `19608ms` (`36337ms` -> `16729ms`)

## Structural Contract

- Canonical target section for this shared lane: `settings-section__callableSectionDefault`.
- A post-change live inventory on the dense `All Settings` surface now shows:
  - `0` `button[role="menuitem"]` roots across `section[data-section-id^="settings-section__"]`
  - `46` lightweight roots with `data-canvas-owned-lightweight-menu-trigger="true"`
  - `46` total `role="menuitem"` roots across those settings sections, so the full section-header trigger family is now on lightweight non-button roots at rest
- The callable canary now mounts its header menu trigger as a lightweight `DIV` root while preserving the same Radix menu semantics (`role="menuitem"`).
- First interaction still works on the live canary:
  - dispatching the normal pointer-down mouse sequence on the callable trigger opens the menu immediately
  - the `Clear Values` item becomes visible with no second click

## Interpretation

- This is the next shared interactive-core slice after the broad switch-family reduction.
- The dense-scene DOM node and input plateaus stayed flat, so the payoff is specifically on the remaining interactive-core button plateau.
- This slice removes the repeated settings section-header menu trigger family from live button roots at rest without reopening a closed section-local chrome lane.
- Absolute dense-scene performance is still not good enough; this is another plateau reduction step, not proof that the branch is done.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Utils/atoms/menubar/menudropdown.tsx src/components/Section/Header/MenuButton/MenuButton.tsx src/components/Section/Container/TextBlockMetaControlMenuButton.tsx src/components/Section/Container/MetaControlMenuButton.tsx tests/e2e/settings/settings-all-settings-lightweight-section-menu-triggers.spec.ts`
- Playwright canary:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.jfU8NM/loop-001/run-005/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-lightweight-section-menu-triggers.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.jfU8NM/loop-001/run-005/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - Vitest passed locally on 2026-04-18
  - Eslint passed locally on 2026-04-18
  - Playwright canary passed locally on 2026-04-18
  - Playwright dense probe passed locally on 2026-04-18 and emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary and caveats
