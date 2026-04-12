# Settings Graph Section Entry Imperative Flush Memoization

Date: 2026-04-15
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce remaining section-entry fan-out on the canary sections layer by avoiding
imperative shell/body handle flushes when an entry's semantic shell/body state
did not change.

## Change

- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx`
  now reuses per-entry shell/body state objects when the entry still points at
  the same section object and the same mounted body state
- the sections-layer layout effect now only calls `updateShell(...)` /
  `updateBody(...)` when the current entry state object differs from the last
  flushed one for that section id
- added a new instrumentation owner,
  `presentedSceneSectionEntryImperativeFlush`, so future live motion probes can
  separate imperative entry flushing from the remaining React-render buckets
- updated focused fan-out/instrumentation tests and the shared Playwright
  residual-owner allowlists to recognize the new owner

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShell.test.tsx`
  - passed (`3` files, `14` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts tests/e2e/settings/settings-view-modes.spec.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- attempted live worktree motion probe:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.FqYaPr/loop-001/run-029/worktree-ai.log`
  - still failed before test discovery with the known direct-runner drift:
    `section_ui_editor_tab_compatibility.json needs an import attribute of type "json"`
- CDP smoke check:
  - `http://127.0.0.1:3053/settings` mounted the settings graph surface after
    a brief loading state
  - expected dark settings graph UI was visible
  - no obvious blank-card or detached-body artifact was visible on the canary
    surface during the smoke check

## Reading

- this is a bounded production reduction on the active section-entry path, not
  another probe-helper iteration
- the new owner gives the next live motion probe a way to distinguish
  imperative section-entry flushing from the existing entry/body React render
  buckets
- the direct worktree Playwright runner remains an external blocker for fresh
  runtime totals, so the next live ranking still needs either a healthy wrapper
  path or a separate trusted probe path instead of more direct-runner repair
