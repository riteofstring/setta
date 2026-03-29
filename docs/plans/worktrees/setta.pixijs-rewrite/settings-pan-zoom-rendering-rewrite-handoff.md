# Settings Pan/Zoom Rendering Rewrite Handoff

Last updated: 2026-04-01
Plan: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md`
Active history: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`
History index: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md`

## Current status

- Latest terminal loop status: `SUBTASK_DONE`
- Current gate focus: Gate 2 tiny-card low-zoom preview fidelity on the normalized live Pixi versus `main` `All Settings` canary.
- This iteration targeted the shared page-runtime sizing path after CDP evidence suggested the nested `browserSectionDefault` preview was still narrower/shorter than `main` and cropped on the right.
- Shared-runtime scene registration now preserves logical width and height from client/offset metrics, and the managed-scene local-bounds math now prefers those logical dimensions over the clipped transformed `getBoundingClientRect()` size.
- Result:
  - the shared runtime no longer derives nested scene size purely from clipped screen-space width/height
  - the normalized canary/main Playwright section-slice parity still passes after updating the guard to compare the shared settled visible slice instead of assuming the historical six-section count
- Remaining drift:
  - the fresh-context CDP compare this iteration could not isolate the nested `browserSectionDefault` preview on either live surface, so the targeted visual improvement was not directly confirmed
  - Gate 2 tiny-card crop/compression drift remains open until a trusted live compare can surface that nested preview itself

## Recent evidence

- Shared-runtime logical-bounds fix landed in:
  - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.tsx`
  - `frontend/src/components/Params/LiveDictAreaPixiPageRuntime.tsx`
- Focused regression coverage now exists for the clipped-screen-rect shared-runtime bounds case:
  - `frontend/src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx`
- The same-state main-reference Playwright compare was updated in:
  - `frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
  - note: a `browserSectionDefault`-specific baseline block-bounds guard was attempted and removed in the same iteration after proving invalid, because that preview is nested and does not map to stable top-level baseline block anchors
- Verification completed this iteration:
  - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx`
    - result: passed
  - `pnpm -C frontend exec prettier --check src/components/Params/LiveDictAreaPixiPageRuntime.tsx src/components/Params/LiveDictAreaPixiOverlayShell.tsx src/components/Params/LiveDictAreaPixiPageRuntime.test.tsx tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
    - result: passed
  - `source activate.sh && WORKTREE_B64=$(setta status --connect-info --latest --json --workspace . | sed 's/^__SETTA_JSON_B64__//') && MAIN_B64=$(setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta | sed 's/^__SETTA_JSON_B64__//') && WORKTREE_BOOTSTRAP_TOKEN=$(node -e '<decode current worktree bootstrap token>' <<< "$WORKTREE_B64") && MAIN_BOOTSTRAP_URL=$(node -e '<decode current main bootstrap url>' <<< "$MAIN_B64") && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3043/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8043 SETTA_BOOTSTRAP_TOKEN="$WORKTREE_BOOTSTRAP_TOKEN" SETTA_MAIN_REFERENCE_URL=http://127.0.0.1:3087/ SETTA_MAIN_REFERENCE_BOOTSTRAP_URL="$MAIN_BOOTSTRAP_URL" pnpm -C frontend exec playwright test --reporter=line tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep 'all settings live Pixi canary and the read-only main reference share the same visible canvas section slice after frontend viewport clear'`
    - result: passed (`1 passed`, about `42s`)
  - fresh-context CDP visual check via sub-agent on live worktree `All Settings`
    - result: inconclusive for the target preview
    - paired direct `/settings` surfaces looked visually identical, but the sub-agent could not surface `browserSectionDefault` itself on either live side; the debug browser rejected the bootstrap-token path, so this was not a targeted nested-preview compare

## Immediate next frontier

- Stay on the product lane and use a compare setup that can actually surface the nested `browserSectionDefault` preview on both canary and `main`.
- Do not retry the removed top-level block-anchor guard; it is the wrong harness for this preview.
- Once the nested preview is isolated, decide whether the remaining Gate 2 crop/compression drift is still a shared-runtime bounds problem or another nested-preview sizing path.

## Durable completed work

- See `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-completed.md` for the maintained summary of landed milestones.
- Use the handoff for the current blocker/frontier only; do not turn it into a second long-form history surface.

## History pointers

- Active history window: items `380` through `403`
- Latest item: `2026-04-01 403`
- Prior product slice: `2026-04-01 402`
- Older detail before item `380`: use the history index to find the relevant archive file
