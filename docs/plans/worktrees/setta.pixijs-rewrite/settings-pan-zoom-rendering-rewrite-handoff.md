# Settings Pan/Zoom Rendering Rewrite Handoff

Last updated: 2026-04-01
Plan: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md`
Active history: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`
History index: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md`

## Current status

- Latest terminal loop status: `REPLAN_REQUIRED`
- Current gate focus: Gate 2 still belongs to the low-zoom tiny-card/right-column preview drift versus `main`, and this iteration did not find a safe production fix worth landing.
- This iteration intentionally leaves the source tree on the pre-iteration renderer baseline after rejecting two production hypotheses:
  - a temporary tiny-card low-zoom glyph thickening pass in `frontend/src/components/Params/LiveDictAreaPixiScene.tsx`
  - a temporary measured-logical-scale shared-runtime pass in `frontend/src/components/Params/LiveDictAreaPixiPageRuntime.tsx` that derived per-scene scale from `sceneBounds.width|height / logicalWidth|logicalHeight`
- Additional blocker evidence gathered this iteration:
  - a live DOM probe that raised the shared page-runtime host from `z-0` back to `z-[4]` did not materially change the blank/header-only tiny-card surface, so item `414` host stacking is not the primary cause of the remaining drift
  - the measured-scale shared-runtime patch passed focused Vitest coverage but the refreshed live worktree screenshot still showed the same header-only tiny cards while `main` kept populated row/value previews
- Conclusion:
  - do not keep iterating on low-zoom alpha/width thresholds or one-line shared-runtime scale tweaks without a deeper plan
  - the next step needs a real replan or deeper instrumentation on the shared tiny-card draw path rather than another speculative renderer patch

## Recent evidence

- Rejected measured-scale production patch:
  - temporary files touched and reverted before finish:
    - `frontend/src/components/Params/LiveDictAreaPixiPageRuntime.tsx`
    - `frontend/src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx`
  - focused verification while the patch was applied:
    - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx src/components/Params/LiveDictAreaPixiScene.test.ts`
      - result: passed (`20 passed`)
    - `pnpm -C frontend exec prettier --check src/components/Params/LiveDictAreaPixiPageRuntime.tsx src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx src/components/Params/LiveDictAreaPixiScene.tsx src/components/Params/LiveDictAreaPixiScene.test.ts`
      - result: passed
  - live visual result:
    - refreshed worktree screenshot still showed the same header-only low-zoom tiny cards; no trustworthy improvement versus `main`
- Same-state screenshot evidence used for the rejection:
  - `main`: `/tmp/setta-main-crop.png`
    - populated row/value previews remain visible inside the tiny cards
  - worktree after the rejected patch: `/tmp/setta-ztest-crop.png`
    - tiny cards still read as header-only dark bodies

## Immediate next frontier

- Stop the automatic iteration lane here and replan the shared tiny-card renderer investigation.
- The next attempt should start from a new plan or deeper instrumentation for the shared page-runtime/top-level tiny-card draw path rather than another harness tweak, alpha tweak, or one-line bounds/scale tweak.

## Durable completed work

- See `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md` for the maintained summary of landed milestones.
- Use the handoff for the current blocker/frontier only; do not turn it into a second long-form history surface.

## History pointers

- Active history window: items `400` through `418`
- Latest item: `2026-04-01 419`
- Prior product slice: `2026-04-01 403`
- Older detail before item `400`: use the history index to find the relevant archive file
