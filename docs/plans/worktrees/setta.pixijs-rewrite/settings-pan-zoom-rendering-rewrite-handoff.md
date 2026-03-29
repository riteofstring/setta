# Settings Pan/Zoom Rendering Rewrite Handoff

Last updated: 2026-04-01
Plan: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md`
Active history: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`
History index: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md`

## Current status

- Latest terminal loop status: `SUBTASK_DONE`
- Current gate focus: Gate 2 normalized `All Settings` low-zoom geometry drift inside the shared page-runtime tiny-card slice.
- This iteration returned to the production renderer lane with one bounded shared-runtime geometry fix.
- Result:
  - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.tsx`
    - `readRegisteredSceneBounds` now preserves subpixel scene rects at `0.01px` precision instead of rounding screen-space `top` / `left` / `width` / `height` to whole pixels before shared-runtime registration.
  - `frontend/src/components/Params/LiveDictAreaPixiPageRuntime.tsx`
    - `getLiveDictAreaPixiManagedSceneLocalBounds` now normalizes the derived local scene origin/size to the same subpixel precision so the shared-runtime stage origin does not bounce on float tails after converting back from screen space at low zoom.
  - Focused regressions now lock the subpixel path in:
    - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx`
    - `frontend/src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx`
  - Focused unit coverage, Prettier, and the normalized same-state Playwright compare all passed with fresh bootstrap URLs.
  - Fresh-context CDP on the normalized worktree/main `All Settings` slice reported the prior extra blank space / downward Y-offset as improved but not fully gone.
- Remaining drift:
  - Gate 2 remains open on low-zoom shared-runtime geometry: the normalized tiny-card stack is closer to `main`, but there is still visible vertical offset between the worktree and `main` slices.
  - Fresh-context CDP also reported divergent active shell names again (`promptSectionDefault` on the worktree, `browserSectionDefault` on `main`) even though both cards still showed the same blue active-outline styling.
  - Do not reopen the selected-card mismatch lane on CDP alone: the existing Playwright active-section guard still passed in this iteration, so treat the mismatch as a residual diagnostic unless both the Playwright guard and fresh CDP reproduce it together.

## Recent evidence

- Verification completed this iteration:
  - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx`
    - result: passed (`31 passed`)
  - `pnpm -C frontend exec prettier --check src/components/Params/LiveDictAreaPixiOverlayShell.tsx src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx src/components/Params/LiveDictAreaPixiPageRuntime.tsx src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx`
    - result: passed
  - `WORKTREE_BOOTSTRAP_URL=<fresh 8043 bootstrap url> && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3043/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8043 SETTA_BOOTSTRAP_TOKEN=\"${WORKTREE_BOOTSTRAP_URL#*#token=}\" SETTA_MAIN_REFERENCE_URL=http://127.0.0.1:3087/ SETTA_MAIN_REFERENCE_BOOTSTRAP_URL=<fresh 8087 bootstrap url> pnpm -C frontend exec playwright test --reporter=line tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep 'all settings live Pixi canary and the read-only main reference share the same visible canvas section slice after frontend viewport clear'`
    - result: passed (`1 passed`, about `22.6s`)
  - fresh-context CDP diagnostic via sub-agent on normalized live worktree/main `All Settings`
    - result: done with residual drift
    - prior low-zoom tiny-card blank-space / downward Y-offset improved but still visible
    - active shell names diverged again in that CDP pass (`promptSectionDefault` worktree vs `browserSectionDefault` main), while both visible cards still showed the same blue active-outline styling

## Immediate next frontier

- Stay on the production renderer lane and inspect the remaining low-zoom shared-runtime Y-offset / internal geometry drift on the normalized `All Settings` slice.
- Start with the remaining scene-origin math around the shared runtime rather than reopening pane/chat normalization or the selected-card mismatch lane.
- If the active-shell mismatch shows up again, require both the Playwright guard and fresh CDP to agree before treating it as the next blocker.

## Durable completed work

- See `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md` for the maintained summary of landed milestones.
- Use the handoff for the current blocker/frontier only; do not turn it into a second long-form history surface.

## History pointers

- Active history window: items `380` through `409`
- Latest item: `2026-04-01 409`
- Prior product slice: `2026-04-01 403`
- Older detail before item `380`: use the history index to find the relevant archive file
