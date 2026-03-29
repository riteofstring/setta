# Settings Param Drag Edge-Handle Projector Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Probe whether batching the screen-to-flow projector inside `edgeHandles.ts`
  reduces layout churn during the live Pixi param-row drag overlay canary.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body&liveDictAreaInteractionMode=param-select`
  - after worktree self-recovery: `http://127.0.0.1:3046/settings?liveDictAreaRenderer=pixi-node-body&liveDictAreaInteractionMode=param-select`
- Interaction:
  1. Open `All Settings`.
  2. Click one param-row drag handoff so the live Pixi param-list overlay is active.
  3. Capture a short DevTools Performance trace around that drag/overlay interaction.

## Candidate Change

- Temporary probe only; reverted after verification.
- The candidate batched edge-handle screen-to-flow projection so one recompute
  batch reused a single viewport-origin read instead of re-reading the flow host
  rect for every visible handle update.

## Baseline

- Trace artifact:
  - `perf/artifacts/settings-param-drag-trace.json`
- Observations:
  - `FunctionCall` dominated the interaction window.
  - `getBoundingClientRect` was the top sampled function in the CPU profile.
  - `UpdateLayoutTree` count: `61`
  - No explicit `getHandleCenter` hotspot was surfaced by name.

## After

- Trace artifact:
  - `perf/artifacts/settings-param-drag-trace-after-pixi.json`
- Observations:
  - `FunctionCall` remained dominant.
  - `getBoundingClientRect` was still present in the CPU profile.
  - `UpdateLayoutTree` count increased to `103`.
  - No explicit `getHandleCenter` hotspot was surfaced by name.

## Verdict

- Reject the probe; do not keep the production change.
- The measured signals moved in the wrong direction and did not isolate the
  edge-handle projector as a meaningful win for this canary.
- The code change was reverted in the same iteration.

## Verification Notes

- Targeted automated check on the recovered runtime:
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3046 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8046 SETTA_BOOTSTRAP_TOKEN=<fresh token> SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "all settings canary can opt into param-select mode through the canary query param for drag-overlay inspection"`
  - result: passed
- CDP visual checks:
  - baseline and post-change checks both kept `All Settings` visible with no
    obvious visual regression in the inspected viewport
  - the post-change check only showed an `Autosaved!` toast after interaction
