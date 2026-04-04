# Settings Pan/Zoom Rendering Rewrite Handoff

Last updated: 2026-04-02
Plan: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md`
Active history: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`
History index: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md`

## Current status

- Latest terminal loop status: `SUBTASK_DONE` after landing the normal-zoom shared-runtime movement registration fix.
- Current source-tree state:
  - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.tsx`
    - shared-runtime scene bounds now re-measure in a layout effect when the owning section's authoritative `useNodeInternals` position changes
    - resize/scroll observers stay in place, but listener churn is now limited to zoom changes instead of every pan tick
  - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx`
    - added a focused regression proving a moved section updates registered shared-runtime bounds without any resize/scroll/zoom signal
- Current priority is Gate 0 basic viability, not looks parity.
- User-visible failures on `http://127.0.0.1:3043/settings?liveDictAreaRenderer=pixi-node-body`:
  - cards can render as blank dark bodies at rest
  - the renderer is blurrier/pixelated than the DOM version
  - interaction/editing is not yet equivalent to the DOM version
  - performance is currently worse than the DOM version
- Checked canary result:
  - fresh-context CDP verification on a visible normal-zoom `Default Child Section Type "Callable"` section showed the Pixi body stayed attached to the shell/header during drag and after drop
- Resolved blocker:
  - the stale shared-runtime coordinates during React Flow node movement are no longer the active blocker for the checked normal-zoom section
- Conclusion:
  - stop spending iterations on low-zoom tiny-card fidelity, palette tweaks, or looks-parity polish
  - keep working on one normal-zoom section at a time until it is visible, attached, interactive, and not obviously slower than the DOM version

## Recent evidence

- Current iteration evidence:
  - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.tsx`
    - now derives a movement signal from `useNodeInternals` and re-runs `readRegisteredSceneBounds()` in the post-commit layout path for section moves
  - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx`
    - new regression confirms registered bounds move from `12,34,320,180` to `84,116,320,180` when only the section position changes
  - Focused verification:
    - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx` passed
    - `pnpm -C frontend exec playwright test --reporter=line tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep 'all settings canary keeps browserSectionDefault on the shared page runtime without dom-context-lost'` passed
    - fresh-context CDP sub-agent drag check passed on a visible `Default Child Section Type "Callable"` section and did not reproduce the detached-body bug

## Immediate next frontier

- The next Ralph slice must target one normal-zoom section on `All Settings`, not tiny cards.
- Movement-attachment lane status:
  - closed for the checked normal-zoom canary; do not reopen this lane unless the detached-body symptom reappears in CDP or a focused test
- Next real frontier:
  - target the remaining Gate 0 blank-dark-body / visible-content failure on a normal-zoom `All Settings` canary section before any looks-parity or tiny-card work
  - once one normal-zoom section is both visible and attached, move next to DOM-equivalent interaction/editing handoff and then the performance floor on that same slice
- Explicitly defer:
  - low-zoom tiny-card polish
  - palette/spacing/chrome parity
  - pixel-perfect parity work
  - any harness-only or oracle-only lane that does not directly unblock Gate 0 basic viability

## Durable completed work

- See `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md` for the maintained summary of landed milestones.
- Use the handoff for the current blocker/frontier only; do not turn it into a second long-form history surface.

## History pointers

- Active history window: items `400` through `422`
- Latest item: `2026-04-02 422`
- Prior product slice: `2026-04-01 403`
- Older detail before item `400`: use the history index to find the relevant archive file
