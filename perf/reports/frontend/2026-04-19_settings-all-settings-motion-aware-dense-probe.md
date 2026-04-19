# Settings All Settings Motion-Aware Dense Probe

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `b0b5d0635ea9c8afda7a801521f80766157489d7` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Related motion-overlay reference: `perf/reports/frontend/2026-04-19_settings-all-settings-param-codeobj-motion-body-overlay-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Add one dense `settings` -> `All Settings` companion probe that drives the real viewport wheel path instead of mutating `.react-flow__viewport.style.transform`, so the newly landed `viewportInteractionActive` body-overlay primitive is measurable on the live canary.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Authentication:
  - fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`
- Dense probe command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-004/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

## Measurement Method

1. Boot the current dev app with authenticated Playwright state.
2. Navigate to `/settings`.
3. Switch to `All Settings`.
4. Trigger one shared React Flow `fit view` and wait until more than `20` visible nodes are mounted.
5. Find one blank point on `.react-flow__pane` and click it to clear active section state.
6. During `120` requestAnimationFrame samples, dispatch a real wheel event on `.react-flow__renderer` at that blank pane point, alternating zoom direction every `6` frames.
7. Record frame deltas from `requestAnimationFrame`, long tasks from `PerformanceObserver`, and motion-body visibility counts from `[data-canvas-owned-motion-body-hidden="true"]`.
8. Wait for the interaction to settle, then emit the DOM counts and final viewport state.

This is a companion probe, not a silent rewrite of the older scripted-transform baseline. Its purpose is to measure the actual viewport-interaction path that now gates the motion-hidden-body overlay.

## Captured Dense Metrics

- Blank pane point: `x=24`, `y=60`
- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `5515`
- Inputs: `3`
- Textareas: `1`
- Buttons: `47`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-41.8`, `zoom=0.1`
- Viewport end after settle: `x=759.9`, `y=-41.8`, `zoom=0.1`
- RAF frames sampled: `119`
- RAF mean: `124.92ms`
- RAF p50: `133.3ms`
- RAF p95: `150.1ms`
- RAF max: `283.4ms`
- RAF frames over `16.7ms`: `119`
- RAF frames over `33.3ms`: `119`
- Long-task count: `123`
- Long-task total: `15188ms`
- Long-task max: `263ms`
- Motion-body roots present on the checked surface: `10`
- Motion-body frame samples: `120`
- Motion-body samples with at least one hidden body: `119`
- Motion-body peak hidden count: `10`
- Motion-body hidden count after settle: `0`

## Interpretation

- The measurement blocker from the prior motion-overlay slice is now removed: the dense probe is driving the real renderer wheel path, not a synthetic transform write, and the shared param-codeobj hidden-body primitive is visibly engaged throughout the loop.
- The overlay is not a no-op on the checked canary. All `10` known motion-body roots participated, and the surface spent `119` of `120` samples with at least one hidden body.
- The real-motion path is still far from acceptable at this canary. Even with the overlay active, the measured loop stayed above `33.3ms` on every sampled frame and landed at `124.92ms` mean.
- Because this probe is motion-aware while the older durable baseline is transform-only, the numbers are not a clean apples-to-apples replacement for the historical series. The useful outcome for sequencing is that future overlay-family product slices can now be judged on the actual `viewportInteractionActive` path instead of the old transform-only surrogate.
- The next bounded product step should use this motion-aware probe while widening or strengthening the inactive-row body-overlay decision from the whole `All Settings` surface, rather than reopening another at-rest text/value lane.

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-004/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- both listed checks passed locally on 2026-04-19
- the live probe emitted the motion-aware dense metrics recorded above
- CDP visual check: not run (`probe-only measurement harness change; no runtime UI change`)
