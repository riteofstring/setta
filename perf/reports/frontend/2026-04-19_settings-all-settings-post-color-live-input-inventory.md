# Settings All Settings Post-Color Live Input Inventory

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `70b9c383e` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-18_settings-all-settings-lightweight-color-input-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-graph-surface-live-input-inventory.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Resolve the stale post-color assumption about the last live `input` / `button` survivors on dense `settings` -> `All Settings` before opening another product lane.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap token from `./scripts/dev-runtime-info.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-graph-surface-live-input-inventory.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `8172`
- Inputs: `3`
- Textareas: `0`
- Buttons: `40`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `99.9ms`
- RAF p50: `99.9ms`
- RAF p95: `200ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `177`
- RAF frames over `33.3ms`: `154`
- Long-task count: `128`
- Long-task total: `16095ms`
- Long-task max: `232ms`

## Fresh Graph-Surface Inventory

The broad document counts still show `3` inputs and `40` buttons, but the new section-scoped inventory closes the stale assumption about where those controls live.

- Mounted settings sections: `46`
- Graph-surface live inputs: `1`
- Graph-surface live textareas: `0`
- Graph-surface live buttons: `1`
- Outside-graph live inputs: `2`
- Outside-graph live textareas: `0`
- Outside-graph live buttons: `39`

The only remaining mounted graph-surface live editor core is:

- Section: `settings-section__stateMachineGateSectionDefault`
- Row: `ParamContainer-settings-section__stateMachineGateSectionDefault-settings-codeobj__stateMachineGateSectionDefault__stateMachineGateSectionDefault__gateType`
- Row text: `Gate Type`
- Live controls at rest:
  - `input[role="combobox"][placeholder="Search"]`
  - one companion Downshift toggle `button` inside the same `search` wrapper

The remaining non-graph inputs are workspace chrome only:

- `input#ProjectPageSearchBar`
- the overview pane `Filter` input

## Interpretation

- The earlier attempt to target `StateMachineSectionSettings.tsx` was the wrong ownership boundary for this survivor.
- The real remaining graph-surface lane is still `settings-section__stateMachineGateSectionDefault`, but it must go through the generic settings-row dropdown path that owns the `Gate Type` row, not the right-pane section inspector path.
- The next product slice should replace that single `Gate Type` row's resting combobox search input/button with the same lightweight retained-canvas dropdown activator used by the existing dropdown lanes.
- After that row drops out, the remaining document-level inputs should be non-target workspace chrome unless a fresh inventory disproves it.

## Comparison Vs. Prior Lightweight Color Input Rerun

- Document nodes: down `10` (`8182` -> `8172`)
- Inputs: unchanged at `3`
- Textareas: unchanged at `0`
- Buttons: unchanged at `40`
- RAF mean: better by `2.98ms` (`102.88ms` -> `99.9ms`)
- RAF p95: unchanged at `200ms`
- Long-task total: better by `427ms` (`16522ms` -> `16095ms`)

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-graph-surface-live-input-inventory.spec.ts`
- Playwright inventory + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-graph-surface-live-input-inventory.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - Eslint passed locally on 2026-04-19
  - Playwright inventory probe passed locally on 2026-04-19
  - Playwright dense baseline probe passed locally on 2026-04-19 and emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary and caveats
