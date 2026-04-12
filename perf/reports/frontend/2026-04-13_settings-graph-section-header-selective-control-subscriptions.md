# Settings Graph SectionHeader Selective Control Subscriptions

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section header controls inside the mounted body subtree

## Goal

Keep default mounted `SectionHeader` instances out of chat follow-selection and
generated-code diagnostics subscriptions when the current section type can never
render those controls.

## Change

- updated `frontend/src/components/Section/Header/SectionHeader.tsx` so the
  default header control path no longer subscribes every mounted header to
  `useAIFollow.selectedSectionIdsByProjectConfigId[...]` and
  `useLspDiagnostics.unmappedGenCode`
- kept the richer control-props contract only for explicit custom
  `controlsRenderer` callers through a separate subscription boundary
- added `frontend/src/components/Section/Header/SectionHeader.test.tsx`
  regressions proving default non-chat code headers stay out of unrelated
  follow-selection commits and unrelated unmapped generated-diagnostics commits

## Why This Slice

- the mounted body subtree still dominates the canonical live canary
- `SectionHeader` is part of every mounted body, and the default control path
  was still paying for store subscriptions that only matter for chat and
  generated-code sections
- this stays on a real production owner inside the body subtree instead of
  reopening startup or oracle work

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Header/SectionHeader.test.tsx`
  - passed (`25` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Header/SectionHeader.tsx src/components/Section/Header/SectionHeader.test.tsx`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-048/worktree-ai.log`
  - passed (`1` Playwright test, `1.9m`)
- fresh-context headless CDP visual check on direct `http://127.0.0.1:3075/settings`
  - the route reached the settings shell but still showed the loading surface
  - visible text included `Loading Setta...` and `Preparing the app surface.`

## Readout

- direct-open worktree phase sequence:
  `96ms app_router_loading` -> `2026ms settings_loading` ->
  `4203ms app_shell_without_surface` -> `7683ms project_loading` ->
  `23976ms surface_ready`
- canonical target stayed `rotaryParamCodeObjDefault`
- live canary still reached `surfaceKind: "canary"` and kept the same dominant
  owner family:
  - `presentedSceneSectionSubtreeReactRender`: `1263.6ms` total,
    `383.5ms` max, `30` commits
  - `presentedSceneSectionBodySubtreeReactRender`: `1239.2ms` total,
    `162ms` max, `32` commits

## Reading

- this slice removed two broad default-header subscriptions from ordinary
  mounted sections, but this run did not move the dominant canary owner
- treat it as one bounded non-winning product hypothesis on the mounted body
  owner chain, not as a perf win
- the next pass should either land one more product cut on the same mounted
  body owner chain or pivot back to fresh attribution if another non-winning
  hypothesis lands without changing the dominant owner
