# Shared Section-Shell S1 Checkpoint 2

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Land the second accepted `Phase S1` wrapper-reduction checkpoint on the locked `S0 Dict` shared-shell scene.

## Scope

Updated `frontend/src/components/Params/GroupContainer.tsx`:

- moved the shared edge-strip center divider from its remaining dedicated DOM node into a `before:` pseudo-element on the strip grid container

Why this checkpoint was accepted:

- the removed divider node was purely visual
- the strip container already owned the actual layout boundary for the divider
- no refs, DnD ownership, measurement ownership, or selection behavior moved

## DOM Read

Locked scene:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- section: `S0 Dict`

Live DOM audit on the locked `S0 Dict` section after the checkpoint:

| Branch | Nodes | Max depth |
| --- | ---: | ---: |
| `main` | 92 | 11 |
| worktree | 76 | 9 |

Wrapper-only candidates from the same live read:

- `main`
  - `div.setta-prevent-section-active-css`
  - `div.pointer-events-none.flex.items-stretch.justify-center`
- worktree
  - `div.setta-prevent-section-active-css`

Key read:

- this checkpoint removed one more wrapper-only node from the locked shared-shell `Dict` scene
- the worktree `S0 Dict` section is now flatter than untouched `main` by `16` nodes and `2` depth levels on the same current read

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx`
- result: `2` files passed, `6` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `14 passed`

Why these gates were chosen:

- direct `Dict` row rendering
- edge/pinned/unpinned behavior
- unpinned scroll/min-height behavior
- shared section resize behavior, including the `Dict` overflow cases

## CDP Visual Verification

Chrome DevTools screenshots were taken on the locked `S0 Dict` scene for both branches.

Visual read:

- edge strip remained aligned
- center divider remained visually centered after moving to a pseudo-element
- pinned header and pinned row remained aligned
- unpinned `gamma` / nested `delta` geometry remained visually aligned with untouched `main`
- no visible drift was accepted in the shared `Dict` shell

## Chrome DevTools Resize Trace

Fresh Chrome DevTools `Performance` traces were recorded for the locked `S0 Dict` resize path after the checkpoint:

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/main-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/worktree-dict-resize.trace.json`

Both runs replayed the same screen-state width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the first saved trace pair, in milliseconds:

| Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | ---: | ---: | ---: |
| `main` | 41.0 | 4.7 | 12.7 |
| worktree | 27.2 | 4.7 | 3.3 |

DevTools summary:

- `main`: `CLSCulprits` only, `CLS 0.00`
- worktree: `CLSCulprits` only, `CLS 0.00`

Trace note:

- an extra `main`-only confirmation trace was captured at `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/main-dict-resize-confirm.trace.json`
- a DevTools trace-state error prevented an equivalent worktree confirmation rerun in the same pass, so the branch-to-branch comparison for this checkpoint uses the first saved pair above

Interpretation:

- this checkpoint earns the DOM simplification win
- on the first saved resize trace pair, it also earns a directional shared-resize-path win versus untouched `main`
- `Phase S1` still is not complete, because the remaining shared pinned shell and other section-shell wrappers have not been flattened yet

## Conclusion

- `Phase S1` now has two accepted checkpoints.
- The shared `Dict` shell is flatter than untouched `main` on the locked S0 scene, and this second checkpoint removed the remaining dedicated divider DOM node.
- The first saved Chrome DevTools resize trace pair now points in the right direction for the branch, but more shared-shell simplification is still required before the phase can be called complete.
- The next S1 step should target the pinned-area inner content wrapper in `GetPinnedParams` and repeat the same screenshot plus DevTools resize-trace gate.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/main-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/worktree-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint2/main-dict-resize-confirm.trace.json`
