# Settings Graph CodeArea Core Shallow Selector

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section body `CoreCodeArea`

## Goal

Remove generic deep-equality work from the ordinary mounted `CodeArea` body
selector without changing which code-section fields the live editor observes.

## Change

- updated `frontend/src/components/Section/Layouts/CodeArea.tsx` so
  `CoreCodeArea` now uses `zustand/shallow` instead of `lodash/isEqual` for the
  selector that reads:
  - `code`
  - `isFrozen`
  - `codeFileBinding?.canonical_path`
- added `frontend/src/components/Section/Layouts/CodeArea.test.tsx` coverage
  proving unrelated `previewSectionVariantMap` writes do not re-commit a
  mounted ordinary `CodeArea`

## Why This Slice

- `CoreCodeArea` is on the mounted section-body path for the canonical
  `rotaryParamCodeObjDefault` lane
- the selector only returns primitive values, so deep equality was paying extra
  comparator cost on a broad mounted body subscription with no behavior benefit

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CodeArea.test.tsx`
  - passed (`5` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Layouts/CodeArea.tsx src/components/Section/Layouts/CodeArea.test.tsx`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-049/worktree-ai.log`
  - passed (`1` Playwright test, `1.3m`)
- fresh-context headless CDP visual check on direct `http://127.0.0.1:3075/settings`
  - the route was still on the project-loading shell rather than the mounted
    graph surface
  - visible strings included `pixijs-graph`, `Loading project...`, and
    `Waiting for project data to load.`

## Readout

- direct `/settings` open still reached `surface_ready` on the worktree probe:
  - `65ms app_router_loading`
  - `2285ms settings_loading`
  - `3901ms app_shell_without_surface`
  - `6713ms project_loading`
  - `18509ms surface_ready`
- canonical target stayed `rotaryParamCodeObjDefault`
- live motion attribution on run `049` still named
  `presentedSceneSectionSubtreeReactRender` as the dominant owner:
  - `871.8ms` total, `258.3ms` max, `30` commits
- the mounted body profiler remained the main inner owner on the same run:
  - `presentedSceneSectionBodySubtreeReactRender`: `853.0ms` total,
    `108.8ms` max, `32` commits

## Reading

- this slice removes comparator overhead from a broad mounted code-editor body
  subscription and keeps the product work on the measured body-owner chain
- it did not move the dominant runtime owner, so count it as one bounded
  non-winning product hypothesis on the mounted body subtree
- the next pass should either land one more bounded cut inside the same body
  owner chain or add fresh attribution that names the next inner body owner
