# Shared Section-Shell S1 Checkpoint 5

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Land the fifth accepted `Phase S1` checkpoint on the locked `S0 Dict` shared-shell scene by removing the outer wrapper's fixed-surface discovery blocker before attempting another wrapper flattening pass.

## Scope

Updated `frontend/src/components/Params/GroupContainer.tsx`:

- replaced the outer wrapper's descendant scan for `[data-params-fixed="true"]` with explicit fixed-surface refs
- threaded the edge-strip surface ref from `EdgesStrip`
- threaded the pinned params surface ref from `GetPinnedParams` / `PinnedParamsArea`
- kept the fixed-height calculation on the same outer wrapper while narrowing the fixed-surface ownership to the real fixed shells

Why this checkpoint was accepted:

- the previous outer-wrapper blocker list was too broad because fixed-surface discovery still depended on a subtree scan
- this checkpoint removes that blocker without changing user-visible layout
- the remaining blocker list is now narrower and backed by code ownership rather than inference

## DOM Read

Locked scene:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- section: `S0 Dict`

Live DOM audit on the locked `S0 Dict` section after the checkpoint:

| Branch | Nodes | Max depth |
| --- | ---: | ---: |
| `main` | 92 | 11 |
| worktree | 73 | 8 |

Wrapper-only candidates from the same live read:

- `main`
  - `div.setta-prevent-section-active-css`
  - `div.pointer-events-none.flex.items-stretch.justify-center`
- worktree
  - `div.setta-prevent-section-active-css`

Key read:

- this checkpoint does not remove another DOM node yet
- the locked shared-shell `Dict` scene stays flatter than untouched `main` by `19` nodes and `3` depth levels
- the accepted change is the ownership split, not a new markup flattening step

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `3` files passed, `20` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `14 passed`

Why these gates were chosen:

- `GroupContainer` markup / shared Dict-shell coverage
- params-area min-height and section sizing integration coverage
- shared section resize behavior, including Dict overflow cases
- edge input/output interaction behavior

## CDP Visual Verification

Chrome DevTools screenshots were taken on the locked `S0 Dict` scene for both branches.

Visual read:

- edge strip remained aligned
- pinned header and pinned first row remained aligned
- unpinned `gamma` / nested `delta` geometry remained aligned
- no visible drift was introduced by the explicit fixed-surface ref split

## Chrome DevTools Resize Trace

Chrome DevTools `Performance` traces were recorded for the locked `S0 Dict` resize path after the checkpoint:

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint5/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint5/worktree-dict-resize-steady.trace.json`

Both runs replayed the same warmed loaded-tab width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the warmed steady pair, in milliseconds:

| Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | ---: | ---: | ---: |
| `main` | 154.5 | 6.4 | 1.2 |
| worktree | 147.2 | 6.8 | 1.0 |

DevTools summary:

- `main`: `CLSCulprits`, `ForcedReflow`, `CLS 0.00`
- worktree: `CLSCulprits`, `ForcedReflow`, `CLS 0.00`

Interpretation:

- this checkpoint does not claim a new markup reduction
- it does keep the worktree slightly ahead on `UpdateLayoutTree` and `Commit` on the locked resize path
- the resize path is still not "finished"; the main value of this checkpoint is that fixed-surface aggregation is no longer a blocker when reasoning about the outer wrapper

## Remaining Outer-Wrapper Ownership

After the explicit fixed-surface refs landed, the outer `section-row-pin-main` wrapper is still blocked by real ownership:

- shared section-grid placement for the pinned/unpinned shell
- param-column width CSS variable ownership and container measurement (`outerRef`)
- loading overlay anchoring
- wrapper padding / margin still included in `paramsFixedHeight`

The removed blocker:

- fixed-surface discovery no longer depends on querying descendants for `[data-params-fixed="true"]`

## Conclusion

- `Phase S1` now has five accepted checkpoints.
- Checkpoint 5 narrows the blocked seam around the outer `GroupContainer` wrapper without introducing visible drift.
- The next S1 step should either split the outer wrapper's column-width / overlay / spacing ownership before retrying that wrapper, or pivot to a different remaining shared-shell seam outside `GroupContainer`.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint5/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint5/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint5/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint5/worktree-dict-resize-steady.trace.json`
