# Shared Section-Shell S1 Checkpoint 6

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Land the sixth accepted `Phase S1` checkpoint on the locked shared `S0 Code` / `S0 Dict` scenes by removing the remaining shared section-header menu wrapper without changing visible section-header behavior.

## Scope

Updated the shared section-header menu path:

- `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`
  - replaced the Radix menubar wrapper path with a direct `DropdownMenu.Trigger` button
  - moved `setta-prevent-section-active-css` onto the real trigger button instead of a wrapper div
- `frontend/src/components/Section/Header/MenuButton/DropdownMenuItem.tsx`
  - added a dropdown-backed shared menu item primitive
- rewired the existing header menu item components to the dropdown-backed primitive
- added a section-header markup canary in `frontend/src/components/Section/Header/SectionHeader.test.tsx`
- added a Dict header-menu-open regression test in `frontend/tests/e2e/params/dict-kwargs.spec.ts`

Why this checkpoint was accepted:

- the remaining exact `div.setta-prevent-section-active-css` seam was in shared section header chrome, not in `GroupContainer`
- the new menu path removes that wrapper on both representative controls
- screenshots and live interaction checks stayed aligned with untouched `main`

## DOM Read

Locked scenes:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- representative sections:
  - `S0 Code`
  - `S0 Dict`

Live DOM audit after the checkpoint:

| Section | Branch | Nodes | Max depth |
| --- | --- | ---: | ---: |
| `S0 Code` | `main` | 113 | 9 |
| `S0 Code` | worktree | 112 | 9 |
| `S0 Dict` | `main` | 98 | 11 |
| `S0 Dict` | worktree | 78 | 8 |

Wrapper-only candidates from the same live read:

- `main`
  - `S0 Code`: `div.setta-prevent-section-active-css`
  - `S0 Dict`: `div.setta-prevent-section-active-css`, `div.pointer-events-none.flex.items-stretch.justify-center`
- worktree
  - `S0 Code`: none
  - `S0 Dict`: none

Key read:

- the shared header wrapper is now gone from both representative controls on the worktree
- `S0 Dict` stays materially flatter than untouched `main` by `20` nodes and `3` depth levels
- `S0 Code` only sheds the single header wrapper node, which matches the targeted seam

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Section/Header/SectionHeader.test.tsx src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `4` files passed, `35` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `15 passed`

Why these gates were chosen:

- section-header SSR markup canary for the removed wrapper seam
- Dict/shared-shell coverage already used by the earlier S1 checkpoints
- direct header-menu interaction coverage after the shared menu primitive swap
- section sizing coverage on the locked representative shell path

## CDP Visual Verification

Chrome DevTools screenshots were taken on `S0 Code` and `S0 Dict` for both branches.

Visual read:

- `S0 Code` header title, menu trigger, diagnostics pill, and right-side actions remained aligned
- `S0 Dict` header title, menu trigger, arg toolbar, and right-side actions remained aligned
- the `S0 Dict` edge strip, pinned header, and nested `delta` row remained visually aligned
- no visible drift was introduced by the section-header menu wrapper removal

## Chrome DevTools Resize Trace

Chrome DevTools `Performance` traces were recorded for the locked resize path after the checkpoint:

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/main-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/worktree-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/worktree-dict-resize-steady.trace.json`

All four runs replayed the same warmed loaded-tab width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the warmed steady pair, in milliseconds:

| Section | Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | --- | ---: | ---: | ---: |
| `S0 Code` | `main` | 149.8 | 6.0 | 1.1 |
| `S0 Code` | worktree | 179.2 | 7.0 | 1.4 |
| `S0 Dict` | `main` | 151.6 | 6.9 | 1.1 |
| `S0 Dict` | worktree | 181.9 | 7.7 | 1.3 |

DevTools summary:

- all four traces surfaced `CLSCulprits` and `ForcedReflow`
- `CLS 0.00` on all four traces

Interpretation:

- the shared-shell DOM flattening is real, but this checkpoint does not improve the warmed resize path
- the worktree regressed on `UpdateLayoutTree`, `Layout`, and `Commit` for both representative controls
- this checkpoint is still useful as a DOM checkpoint because it removes the last exact shared header-wrapper seam visible in the locked read, but it does not close the performance gap

## Conclusion

- `Phase S1` now has six accepted checkpoints.
- Checkpoint 6 removes the remaining exact shared section-header wrapper seam on the locked representative controls with no visible drift.
- `Phase S1` is still not complete because the remaining outer `GroupContainer` seam is blocked by real ownership and the warmed resize path is still slower than untouched `main` after this checkpoint.
- The next step should either split the remaining outer-wrapper column-width / overlay / spacing ownership for one more blocked-wrapper attempt, or conclude that the decorative/wrapper-only pass is exhausted and prepare the first `Phase S2` shared row/shell checkpoint with a fresh ownership read.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/main-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/worktree-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/main-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/worktree-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint6/worktree-dict-resize-steady.trace.json`
