# Settings All Settings Retained Canvas Dense Rerun

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `2d0e18353a87` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the first durable post-surface dense `settings` -> `All Settings` measurement after landing the retained-canvas graph-surface seam and the store-owned transform-authority slice.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-022/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Measurement Method

This rerun uses the existing baseline probe, but the probe now normalizes the live surface with one `fit view` click before sampling. That normalization was needed because the current `All Settings` landing state can otherwise open into a close-in view that is not a trustworthy dense-scene compare.

After that normalization, the probe:

1. Boots the current dev app with authenticated Playwright state.
2. Navigates to `/settings`.
3. Switches to `All Settings`.
4. Triggers one shared `fit view` from the React Flow controls and waits until the dense graph shows more than `20` visible nodes.
5. Samples DOM counts on the live page.
6. Applies the deterministic `180`-frame scripted transform loop directly to `.react-flow__viewport`.
7. Measures frame deltas from `requestAnimationFrame` and long tasks from `PerformanceObserver`.
8. Restores the original viewport transform and emits the metrics payload.

The normalized `fit view` landed on the same `x/y/zoom` start state as the durable baseline (`x=759.9`, `y=-51.75`, `zoom=0.1`), so this rerun is directly comparable to the 2026-04-18 pre-change report.

## Captured Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `9517`
- Inputs: `90`
- Textareas: `0`
- Buttons: `507`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.75`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.75`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `111.45ms`
- RAF p50: `116.6ms`
- RAF p95: `216.6ms`
- RAF max: `266.7ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `166`
- Long-task count: `134`
- Long-task total: `18159ms`
- Long-task max: `261ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Comparison Vs. Durable Baseline

- Flow nodes: unchanged at `46`
- Visible flow nodes: unchanged at `46`
- Document nodes: down `36` (`9553` -> `9517`)
- Inputs: down `2` (`92` -> `90`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `14` (`521` -> `507`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: improved by `93.48ms` (`204.93ms` -> `111.45ms`, about `45.6%` faster)
- RAF p95: effectively unchanged (`216.7ms` -> `216.6ms`)
- RAF max: improved by `50ms` (`316.7ms` -> `266.7ms`)
- Long-task count: down `47` (`181` -> `134`)
- Long-task total: improved by `18178ms` (`36337ms` -> `18159ms`, about `50.0%` lower)
- Long-task max: improved by `40ms` (`301ms` -> `261ms`)

## Interpretation

- The retained-canvas surface is buying a real dense-scene motion win: the same normalized `All Settings` view now measures substantially better than the pre-change `go-rewrite` baseline on both mean RAF time and total long-task time.
- The branch is not through the dense-scene gate yet. Every sampled frame still missed `16.7ms`, `166/179` frames still missed `33.3ms`, and long tasks still accumulated more than `18s` across the scripted run.
- The DOM cost barely moved while performance improved: the graph still mounts about `9.5k` total elements and more than `500` buttons. That is strong evidence that the remaining blocker is still the live inactive row/widget DOM, not the already-closed callable/dict/GlobalVariables shell-text micro-lanes.
- The next product frontier should stay on graph-surface architecture and dense inactive-content reduction, not reopen section-specific chrome harvesting unless a fresh visible defect appears.

## Verification

- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-baseline.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-022/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - passed locally on 2026-04-18
  - emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration status summary
