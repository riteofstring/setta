# Settings Graph SectionContainer Active UI Subscription Boundary

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section body shell

## Goal

Keep ordinary mounted `SectionContainer` bodies out of `useActiveSectionUI`
commits when they are not rendering the joined code-terminal shell that
actually needs active-state highlighting.

## Change

- updated `frontend/src/components/Section/Container/SectionContainer.tsx` so
  the `useIsSectionUIActive(...)` subscriptions moved out of the default
  mounted-body path and into a joined code-terminal branch component
- added `frontend/src/components/Section/Container/SectionContainer.test.tsx`
  with a profiler regression proving a non-joined section container does not
  re-commit when `useActiveSectionUI.activeIds` changes

## Why This Slice

- the previous `SectionContainer` body path subscribed every mounted section to
  active-section UI state even though the active highlight is only consumed by
  the joined code-terminal shell branch
- this keeps the product slice inside the mounted body subtree instead of
  reopening startup-shell or oracle work

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainer.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  - passed (`2` files, `3` tests)
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-047/worktree-ai.log`
  - passed (`1` Playwright test, `1.5m`)
- fresh-context headless CDP visual check on direct `http://127.0.0.1:3075/settings`
  - route still showed the loading shell rather than the mounted graph surface
  - visible text: `PREPARING SETTA`, `Loading settings…`, `Backend: Starting backend services`

## Readout

- direct `/settings` open still progressed through the explicit startup phases
  and reached `surface_ready` on the Playwright probe at `~19.7s`
- canonical target stayed `rotaryParamCodeObjDefault`
- live motion attribution on run `047` still named
  `presentedSceneSectionSubtreeReactRender` as the dominant owner:
  - `977.2ms` total, `281.1ms` max, `30` commits
- the mounted body profiler remained the main inner owner on the same run:
  - `presentedSceneSectionBodySubtreeReactRender`: `958.0ms` total,
    `108.8ms` max, `32` commits

## Reading

- this slice removed one real broad subscription from the mounted body shell
  path, but the live canary still spends most motion time inside the mounted
  body subtree rather than the outer shell contract
- the next bounded product cut should stay inside the mounted body owner chain
  and target another broad body subscriber or shared write-fan-out path
