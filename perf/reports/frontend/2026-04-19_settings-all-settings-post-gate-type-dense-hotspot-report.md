# Settings All Settings Post-Gate-Type Dense Hotspot Report

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `b2a00b50b4` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-19_settings-all-settings-post-color-live-input-inventory.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Capture one fresh dense rerun plus one focused hotspot trace on the post-`Gate Type` surface so the next product lane comes from current evidence now that graph-surface live `input` / `button` survivors are gone at rest.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - dense probe: Playwright Chromium, headless Linux
  - hotspot trace: Chrome DevTools MCP, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication:
  - Playwright probe: fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`
  - CDP trace: fresh one-shot bootstrap URL from `./scripts/dev-runtime-info.sh`
- Dense probe command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Measurement Method

The dense rerun uses the same normalized baseline probe as the earlier retained-canvas reports:

1. Boot the current dev app with authenticated Playwright state.
2. Navigate to `/settings`.
3. Switch to `All Settings`.
4. Trigger one shared React Flow `fit view` and wait until more than `20` visible nodes are mounted.
5. Sample live DOM counts.
6. Apply the deterministic `180`-frame scripted transform loop directly to `.react-flow__viewport`.
7. Measure frame deltas from `requestAnimationFrame` and long tasks from `PerformanceObserver`.
8. Restore the original viewport transform and emit the metrics payload.

The hotspot trace reused that same normalized surface and traced the same style of scripted `.react-flow__viewport` motion through Chrome DevTools MCP `performance_start_trace` / `performance_stop_trace`.

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `8163`
- Inputs: `2`
- Textareas: `0`
- Buttons: `39`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `100.83ms`
- RAF p50: `100ms`
- RAF p95: `183.4ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `176`
- RAF frames over `33.3ms`: `154`
- Long-task count: `127`
- Long-task total: `16261ms`
- Long-task max: `233ms`

## Comparison Vs. Prior Post-Color Inventory

- Document nodes: down `9` (`8172` -> `8163`)
- Inputs: down `1` (`3` -> `2`)
- Buttons: down `1` (`40` -> `39`)
- RAF mean: worse by `0.93ms` (`99.9ms` -> `100.83ms`)
- RAF p95: better by `16.6ms` (`200ms` -> `183.4ms`)
- Long-task total: worse by `166ms` (`16095ms` -> `16261ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1390` (`9553` -> `8163`)
- Inputs: down `90` (`92` -> `2`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `482` (`521` -> `39`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `104.1ms` (`204.93ms` -> `100.83ms`)
- RAF p95: better by `33.3ms` (`216.7ms` -> `183.4ms`)
- Long-task total: better by `20076ms` (`36337ms` -> `16261ms`)

## Hotspot Trace

- Trace artifact: `perf/artifacts/frontend/settings-all-settings/post-gate-type-dense-pan-trace-2026-04-19.json`
- Insight set: `NO_NAVIGATION`
- Insight summary:
  - `CLS: 0.00`
  - `DocumentLatency`: estimated savings `none`
  - `Forced reflow`: no problem surfaced in this trace window

## Interpretation

- The previous `settings-section__stateMachineGateSectionDefault` inventory remains closed: the fresh dense rerun stays at just `2` document `input` roots and `39` document `button` roots, matching the earlier proof that graph-surface live editor/button survivors are gone and the remaining controls are workspace chrome only.
- The trace did not surface a new layout-thrash or document-latency culprit. The strongest remaining signal is the sustained cost of moving the still-dense mounted graph surface under the repeated `.react-flow__viewport` transform loop.
- That means the next product frontier is no longer another lightweight activator family. The next slice needs to remove or transfer more resting section-body / row-value DOM cost from the moving graph surface itself, likely by pushing a broader static body/value primitive into the retained scene rather than shaving the last interactive-core controls.
- This report is still proof of direction, not proof of success. `All Settings` remains far above the branch target budget even after the graph-surface editor survivors are gone at rest.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - Playwright dense probe passed locally on 2026-04-19 and emitted the metrics recorded above
- CDP trace + visual check:
  - trace artifact captured locally on 2026-04-19
  - `/settings` was healthy
  - `All Settings` was active
  - the graph surface was mounted with more than `20` visible nodes
  - no crash overlay was visible during the trace pass
