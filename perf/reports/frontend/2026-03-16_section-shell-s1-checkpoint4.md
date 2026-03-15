# Shared Section-Shell S1 Checkpoint 4

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Land the fourth accepted `Phase S1` wrapper-reduction checkpoint on the locked `S0 Dict` shared-shell scene.

## Scope

Updated `frontend/src/components/Params/GroupContainer.tsx`:

- removed the left and right edge-strip row-list wrapper divs
- made each edge row a direct child of its column container

Updated `frontend/src/components/Params/GroupContainer.test.tsx`:

- added a static markup canary for the flattened edge-strip row structure

Why this checkpoint was accepted:

- the removed row-list wrappers were purely structural grouping
- no refs, DnD ownership, or measurement ownership moved
- the edge-strip root still owns height measurement and the divider pseudo-element

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

- this checkpoint removed two more edge-strip wrappers from the locked shared-shell `Dict` scene
- the worktree `S0 Dict` section is now flatter than untouched `main` by `19` nodes and `3` depth levels on the same current read

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx`
- result: `2` files passed, `8` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `14 passed`

Why these gates were chosen:

- direct `Dict` row rendering
- edge input/output interaction behavior
- params area min-height behavior
- shared section resize behavior, including the `Dict` overflow cases

## CDP Visual Verification

Chrome DevTools screenshots were taken on the locked `S0 Dict` scene for both branches.

Visual read:

- edge strip remained aligned
- left and right edge rows stayed visually aligned after the wrapper removal
- pinned header and pinned first row stayed aligned with untouched `main`
- unpinned `gamma` / nested `delta` geometry remained visually aligned
- no visible drift was accepted in the shared `Dict` shell

## Chrome DevTools Resize Trace

Chrome DevTools `Performance` traces were recorded for the locked `S0 Dict` resize path after the checkpoint:

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint4/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint4/worktree-dict-resize-steady.trace.json`

Both runs replayed the same screen-state width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the loaded-tab steady pair, in milliseconds:

| Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | ---: | ---: | ---: |
| `main` | 181.7 | 9.3 | 3.8 |
| worktree | 157.8 | 8.3 | 2.8 |

DevTools summary:

- `main`: `CLSCulprits`, `ForcedReflow`, `CLS 0.00`
- worktree: `CLSCulprits`, `ForcedReflow`, `CLS 0.00`

Interpretation:

- this checkpoint earns the DOM simplification win
- on the steady loaded-tab trace pair, it also earns a directional resize-path win versus untouched `main`
- `Phase S1` still is not complete because the remaining outer `GroupContainer` shell is blocked by real ownership, not by decorative wrapper-only nodes

## Conclusion

- `Phase S1` now has four accepted DOM-simplification checkpoints.
- The shared `Dict` shell is materially flatter than untouched `main` on the locked S0 scene, and this checkpoint removed the last obvious edge-strip row-list wrappers.
- The steady loaded-tab resize trace pair now also points in the right direction for this checkpoint.
- The next S1 step should stop treating the outer `section-row-pin-main` wrapper as a small removable seam and instead split its fixed-surface / column-width ownership before retrying that shell.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint4/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint4/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint4/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint4/worktree-dict-resize-steady.trace.json`
