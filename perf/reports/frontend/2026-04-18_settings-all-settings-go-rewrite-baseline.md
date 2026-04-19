# Settings All Settings Go-Rewrite Baseline

Date: 2026-04-18
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `fcb81b60b8d2`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Capture the first durable pre-change `All Settings` baseline on the `origin/go-rewrite`-based restart before any Pixi-owned camera or resting-surface product work lands.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> PLAYWRIGHT_HEADLESS=1 setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`

## Measurement Method

The baseline probe does not record a DevTools trace and does not drive pointer-wheel pan/zoom. Instead it:

1. Boots the current dev app with authenticated Playwright state.
2. Navigates to `/settings`.
3. Switches to `All Settings`.
4. Waits until the dense graph is mounted.
5. Samples DOM counts on the live page.
6. Applies a deterministic `180`-frame scripted transform loop directly to `.react-flow__viewport`.
7. Measures frame deltas from `requestAnimationFrame` and long tasks from `PerformanceObserver`.
8. Restores the original viewport transform and emits the metrics payload.

This makes the report a useful pre-change branch baseline, but it is not directly apples-to-apples with the older staged March benchmark that used traced user-like pan/zoom loops and stage-specific code paths.

## Captured Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `9553`
- Inputs: `92`
- Textareas: `1`
- Buttons: `521`
- Canvas elements: `0`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `204.93ms`
- RAF p50: `200ms`
- RAF p95: `216.7ms`
- RAF max: `316.7ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `179`
- Long-task count: `181`
- Long-task total: `36337ms`
- Long-task max: `301ms`

Sample section ids seen in the mounted graph:

- `settings-section__backend`
- `settings-section__browserSectionDefault`
- `settings-section__buttonParamCodeObjDefault`
- `settings-section__callableSectionDefault`
- `settings-section__chartSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__chatWindowing`
- `settings-section__codeCallableCodeObjDefault`

## Interpretation

- The current `go-rewrite` baseline is still paying the full dense DOM cost on `All Settings`: roughly `9.5k` document nodes, `521` buttons, and no Pixi/canvas-owned resting surface.
- Even this synthetic transform loop is deep into Gate 0 / Phase 1 trouble: every sampled frame missed both the `16.7ms` and `33.3ms` budgets, and long-task accumulation exceeded `36s` across the run.
- The restored viewport transform matched the starting transform exactly, so the probe itself did not leave the page in a drifted state.
- This is strong enough to serve as the durable pre-change branch baseline. The next planned frontier should move to the first Pixi-owned camera/surface seam rather than spend another iteration refining the baseline harness unless a concrete trust issue appears.

## Verification

- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> PLAYWRIGHT_HEADLESS=1 setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
- Result:
  - passed locally on 2026-04-18
  - emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration status summary
