# Shared Section-Shell S1 Checkpoint 3

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Land the third accepted `Phase S1` wrapper-reduction checkpoint on the locked `S0 Dict` shared-shell scene.

## Scope

Updated `frontend/src/components/Params/GroupContainer.tsx`:

- removed the pinned-area inner content wrapper in `GetPinnedParams`
- moved the wrapper-owned padding and `contentRef` onto the outer pinned `section`

Why this checkpoint was accepted:

- the removed wrapper was a pure shell node between the pinned `section` and the real pinned content
- the pinned `section` can own the same padding contract directly
- `headerRef`, `rowsRef`, and `ParamDndList` ownership stayed intact
- the min-height measurement path still reads from the same rendered shell, just one level higher

## DOM Read

Locked scene:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- section: `S0 Dict`

Live DOM audit on the locked `S0 Dict` section after the checkpoint:

| Branch | Nodes | Max depth |
| --- | ---: | ---: |
| `main` | 92 | 11 |
| worktree | 75 | 8 |

Wrapper-only candidates from the same live read:

- `main`
  - `div.setta-prevent-section-active-css`
  - `div.pointer-events-none.flex.items-stretch.justify-center`
- worktree
  - `div.setta-prevent-section-active-css`

Key read:

- this checkpoint removed one more shared pinned-shell wrapper from the locked `Dict` scene
- the worktree `S0 Dict` section is now flatter than untouched `main` by `17` nodes and `3` depth levels on the same current read

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx`
- result: `2` files passed, `7` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `14 passed`

Why these gates were chosen:

- direct `Dict` row rendering
- edge/pinned/unpinned behavior
- pinned and unpinned shared-shell geometry
- shared section resize behavior, including the `Dict` overflow cases

## CDP Visual Verification

Chrome DevTools screenshots were taken on the locked `S0 Dict` scene for both branches.

Visual read:

- the pinned header stayed aligned after the wrapper removal
- the pinned first row stayed aligned with untouched `main`
- edge strip and unpinned `gamma` / nested `delta` geometry stayed visually aligned
- no visible drift was accepted in the shared `Dict` shell

## Chrome DevTools Resize Trace

Chrome DevTools `Performance` traces were recorded for the locked `S0 Dict` resize path after the checkpoint.

Branch comparison uses the loaded-tab steady pair:

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/worktree-dict-resize-steady.trace.json`

Trace note:

- a first duplicate-tab pair was also captured at:
  - `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/main-dict-resize.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/worktree-dict-resize.trace.json`
- that first pair included tab-startup work and is not used as the checkpoint comparison

The steady comparison runs replayed the same screen-state width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the loaded-tab steady pair, in milliseconds:

| Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | ---: | ---: | ---: |
| `main` | 189.2 | 14.5 | 4.0 |
| worktree | 376.6 | 62.4 | 7.3 |

DevTools summary:

- `main`: `CLSCulprits`, `ForcedReflow`, `CLS 0.00`
- worktree: `CLSCulprits`, `ForcedReflow`, `CLS 0.00`

Interpretation:

- this checkpoint earns the DOM simplification win
- it does not earn a resize-path performance win
- the steady loaded-tab trace pair regressed on the worktree versus untouched `main`, so the remaining outer shared shell still needs investigation

## Conclusion

- `Phase S1` now has three accepted DOM-simplification checkpoints.
- The shared `Dict` shell is materially flatter than untouched `main` on the locked S0 scene, and the pinned shell no longer pays for its extra inner content wrapper.
- The resize path is still not solved. On the steady comparison pair, the worktree remains more expensive than untouched `main`.
- The next S1 step should re-analyze the remaining outer shared `GroupContainer` shell, especially the `section-row-pin-main` wrapper and the remaining wrapper-only `setta-prevent-section-active-css` seam, and repeat the same screenshot plus DevTools resize-trace gate.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/worktree-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/main-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint3/worktree-dict-resize.trace.json`
