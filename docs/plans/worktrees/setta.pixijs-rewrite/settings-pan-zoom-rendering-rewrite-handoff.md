# Settings Pan/Zoom Rendering Rewrite Handoff

Last updated: 2026-04-01
Plan: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md`
Active history: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`
History index: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md`

## Current status

- Latest terminal loop status: `SUBTASK_DONE`
- Current gate focus: Gate 2 still belongs to the low-zoom tiny-card/right-column preview drift versus `main`, but the focused shared-runtime compare blocker from the last iteration is now resolved and should not be reopened by default.
- This iteration closed the compare-surface blocker in the E2E canary itself:
  - in `frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`, added `expectSharedPageRuntimeSectionWithoutDomContextLost()` so the shared-runtime guards assert the target section stays managed, Pixi-backed, and free of per-section DOM fallback without relying on unrelated global `runtime.contextLost`
  - updated every `shared page runtime without dom-context-lost` canary in that file to use the new helper instead of duplicating brittle string assertions
  - relaxed `expectFocusedSectionCompareSurface()` to require a centered, fully visible section with non-zero bounds instead of a fixed viewport-percentage minimum size that the real focused `browserSectionDefault` surface no longer satisfies
- Conclusion:
  - do not reopen the focused compare blocker on the old `runtime.contextLost === true` expectation
  - do not restore the old minimum height/width readiness threshold; it rejects the real focused compare surface that the exact `fitView(..., padding: 0.2)` flow produces

## Recent evidence

- Focused Playwright slice after the assertion cleanup:
  - command:
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3043/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8043 SETTA_BOOTSTRAP_TOKEN=<fresh worktree token> SETTA_MAIN_REFERENCE_URL=http://127.0.0.1:3088/ SETTA_MAIN_REFERENCE_BOOTSTRAP_URL=<fresh main bootstrap url> pnpm -C frontend exec playwright test --reporter=line tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep 'shared page runtime without|share the same visible canvas section slice after frontend viewport clear'`
  - result:
    - passed (`19 passed`, about `8.7m`)
- Formatting check:
  - `pnpm -C frontend exec prettier --check tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
    - result: passed
- Fresh-context CDP visual check:
  - result: done
  - worktree `/settings` with the exact `fitView({ duration: 0, nodes: [{ id: sectionId }], padding: 0.2 })` flow:
    - `browserSectionDefault` found, fully visible, effectively centered (`horizontalCenterOffset ~= 0`, `verticalCenterOffset = 0`)
  - main `/settings` with the same raw exact `fitView(...)` flow:
    - `browserSectionDefault` found and fully visible, but still left-shifted (`horizontalCenterOffset ~= 147.5px`) with `callableSectionDefault` remaining visible on the right
  - implication:
    - the readiness helper must stay tolerant of the raw `main` fitView offset; the later compare assertions already sync the main viewport to the canary viewport before judging direct bounds parity

## Immediate next frontier

- Return to the product lane from items `400`, `402`, and `417`.
- Use the trusted same-state compare path to pick the next concrete low-zoom tiny-card/right-column preview drift versus `main`; avoid another compare-surface harness slice unless a new blocker appears that cannot be resolved inside the production renderer path.

## Durable completed work

- See `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md` for the maintained summary of landed milestones.
- Use the handoff for the current blocker/frontier only; do not turn it into a second long-form history surface.

## History pointers

- Active history window: items `400` through `418`
- Latest item: `2026-04-01 418`
- Prior product slice: `2026-04-01 403`
- Older detail before item `400`: use the history index to find the relevant archive file
