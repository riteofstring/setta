# Settings All Settings Section Sizing Policy Lightweight Nested Children Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `6540867d9` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-lightweight-param-label-rerun.md`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after removing the extra nested child-row wrapper on the active `settings-section__sectionSizingPolicy` lane so lightweight nested rows now mount directly under their owning param row.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-029/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

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
- Document nodes: `8604`
- Inputs: `60`
- Textareas: `0`
- Buttons: `477`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.75`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.75`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `110.24ms`
- RAF p50: `100.1ms`
- RAF p95: `216.6ms`
- RAF max: `233.5ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `158`
- Long-task count: `128`
- Long-task total: `17832ms`
- Long-task max: `240ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Comparison Vs. Prior Section Sizing Policy Lightweight Param Label Rerun

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: down `43` (`8647` -> `8604`)
- Inputs: unchanged at `60`
- Textareas: unchanged at `0`
- Buttons: unchanged at `477`
- Canvas elements: unchanged at `1`
- CodeMirror editors: unchanged at `0`
- RAF mean: improved by `2.14ms` (`112.38ms` -> `110.24ms`)
- RAF p95: improved by `0.1ms` (`216.7ms` -> `216.6ms`)
- RAF max: improved by `33ms` (`266.5ms` -> `233.5ms`)
- Long-task count: down `2` (`130` -> `128`)
- Long-task total: improved by `352ms` (`18184ms` -> `17832ms`)
- Long-task max: improved by `26ms` (`266ms` -> `240ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `949` (`9553` -> `8604`)
- Inputs: down `32` (`92` -> `60`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `44` (`521` -> `477`)
- Canvas elements: up `1` (`0` -> `1`)
- CodeMirror editors: unchanged at `0`
- RAF mean: improved by `94.69ms` (`204.93ms` -> `110.24ms`)
- RAF p95: improved by `0.1ms` (`216.7ms` -> `216.6ms`)
- RAF max: improved by `83.2ms` (`316.7ms` -> `233.5ms`)
- Long-task count: down `53` (`181` -> `128`)
- Long-task total: improved by `18505ms` (`36337ms` -> `17832ms`)
- Long-task max: improved by `61ms` (`301ms` -> `240ms`)

## Interpretation

- This slice removed one repeated nested-child container per owned `settings-section__sectionSizingPolicy` subgroup without reopening any closed callable/dict/globalVariables ownership lanes.
- The paired `sectionSizingPolicy` probe now proves the legacy nested wrapper count is `0` at rest, with `43` lightweight nested-guide roots replacing those containers while the dense section still keeps repeated inactive controls off the live DOM.
- The dense baseline `documentNodeCount` moved again (`8647` -> `8604`), so this was another real structural DOM reduction on the active dense lane instead of another forwarding-only ownership hop.
- Motion also improved slightly on this rerun, so this slice reduced DOM cost without paying an obvious new motion penalty.
- The next product slice should stay on `settings-section__sectionSizingPolicy` and target the next repeated structural row/container subtree still mounted above the already-lightweight text/dropdown/resize/label/nested-child activators before opening a new dense section lane.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.test.tsx src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
- Playwright canary:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-029/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-029/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - passed locally on 2026-04-18
  - emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration status summary
