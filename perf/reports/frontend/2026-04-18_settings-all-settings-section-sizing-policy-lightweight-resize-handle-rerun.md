# Settings All Settings Section Sizing Policy Lightweight Resize Handle Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `12c0d0ef1` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-meta-control-dropdown-rerun.md`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after collapsing the repeated `settings-section__sectionSizingPolicy` row resize handles from the legacy three-`div` structure to a single lightweight handle node on the active retained-canvas lane.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-027/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

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
- Document nodes: `8815`
- Inputs: `60`
- Textareas: `0`
- Buttons: `477`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.75`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.75`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `110.98ms`
- RAF p50: `100.1ms`
- RAF p95: `233.3ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `178`
- RAF frames over `33.3ms`: `161`
- Long-task count: `127`
- Long-task total: `17907ms`
- Long-task max: `250ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Comparison Vs. Prior Section Sizing Policy Meta-Control Dropdown Rerun

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: down `336` (`9151` -> `8815`)
- Inputs: unchanged at `60`
- Textareas: unchanged at `0`
- Buttons: unchanged at `477`
- Canvas elements: unchanged at `1`
- CodeMirror editors: unchanged at `0`
- RAF mean: worse by `1.39ms` (`109.59ms` -> `110.98ms`)
- RAF p95: worse by `16.7ms` (`216.6ms` -> `233.3ms`)
- RAF max: unchanged at `250ms`
- Long-task count: unchanged at `127`
- Long-task total: worse by `227ms` (`17680ms` -> `17907ms`)
- Long-task max: improved by `3ms` (`253ms` -> `250ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `738` (`9553` -> `8815`)
- Inputs: down `32` (`92` -> `60`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `44` (`521` -> `477`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: improved by `93.95ms` (`204.93ms` -> `110.98ms`)
- RAF p95: worse by `16.6ms` (`216.7ms` -> `233.3ms`)
- RAF max: improved by `66.7ms` (`316.7ms` -> `250ms`)
- Long-task count: down `54` (`181` -> `127`)
- Long-task total: improved by `18430ms` (`36337ms` -> `17907ms`)
- Long-task max: improved by `51ms` (`301ms` -> `250ms`)

## Interpretation

- This slice materially reduced dense inactive DOM on the active `settings-section__sectionSizingPolicy` lane without reopening any closed callable/dict/globalVariables ownership work.
- The paired section probe now shows the dense section uses `168` lightweight resize handles at rest and `0` legacy nested resize-handle nodes, which matches the intended structural cut on the retained-canvas path.
- The dense baseline `documentNodeCount` moved meaningfully (`9151` -> `8815`), so this is a real row-structure reduction rather than another cosmetic ownership hop.
- Motion did not improve on this rerun, and the heavier `p95` means this should be treated as a DOM-cost reduction prerequisite, not as a fresh motion win.
- The next product slice should keep attacking repeated structural row DOM on `settings-section__sectionSizingPolicy` or the next similarly dense section, not reopen another micro-lane that only changes one inactive control family.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ResizeHandle.test.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - note: adding `src/components/Params/ParamContainer.test.tsx` still hits the pre-existing `html-encoding-sniffer` / `@exodus/bytes` jsdom issue already documented in the active handoff, so the checked pass stayed on the new static tests.
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ResizeHandle.tsx src/components/Params/ResizeHandle.test.tsx src/components/Params/ParamContainer.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
- Playwright canary:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-027/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-027/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - passed locally on 2026-04-18
  - emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration status summary
