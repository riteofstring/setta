# Shared Section-Shell S2 Checkpoint 1

Date: 2026-03-17
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Start `Phase S2` after the wrapper-only `Phase S1` pass by removing the surviving `grid-cols-subgrid` contract from the shared pinned/unpinned params shells in `GroupContainer` while preserving the locked `S0 Code` / `S0 Dict` scenes.

## Scope

Updated `frontend/src/components/Params/GroupContainer.tsx`:

- removed `grid-cols-subgrid` from the pinned params rows shell
- removed `grid-cols-subgrid` from the unpinned params scroll shell
- kept the existing `section-args-nested` grid contract, refs, observers, and sizing behavior unchanged

Updated `frontend/src/components/Params/GroupContainer.test.tsx`:

- extended the existing markup canaries so the pinned and unpinned shells explicitly do not render `grid-cols-subgrid`

Why this checkpoint belongs to `Phase S2`:

- `Phase S1` had already exhausted wrapper-only seams on the locked representative controls
- the next surviving structural contract was the explicit subgrid dependency in the shared params shells
- this changes layout ownership rather than removing a purely decorative wrapper

## DOM Read

Locked scenes:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- representative sections:
  - `S0 Code`
  - `S0 Dict`

Live DOM audit after the checkpoint:

| Section | Branch | Nodes | Max depth | `grid-cols-subgrid` count |
| --- | --- | ---: | ---: | ---: |
| `S0 Code` | `main` | 113 | 9 | 0 |
| `S0 Code` | worktree | 112 | 9 | 0 |
| `S0 Dict` | `main` | 98 | 11 | 3 |
| `S0 Dict` | worktree | 78 | 8 | 0 |

Key read:

- the worktree removes the surviving subgrid utility usage from the locked `S0 Dict` shell
- `S0 Dict` stays materially flatter than untouched `main` by `20` nodes and `3` depth levels
- `S0 Code` stays structurally unchanged apart from the already-landed shared header flattening from checkpoint 6

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `3` files passed, `20` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `15 passed`

Why these gates were chosen:

- shared Dict-shell markup coverage
- params-area sizing behavior and section sizing integration
- direct Dict/shared-shell interaction coverage
- section resize behavior on the same path used by the perf traces

## CDP Visual Verification

Chrome DevTools screenshots were taken on `S0 Code` and `S0 Dict` for both branches.

Visual read:

- `S0 Code` header title, diagnostics pill, editor surface, and right-side actions remained aligned
- `S0 Dict` header title, arg toolbar, edge strip, pinned header, and nested `delta` row remained aligned
- no visible drift was introduced by removing `grid-cols-subgrid` from the shared pinned/unpinned shells

## Chrome DevTools Resize Trace

Chrome DevTools `Performance` traces were recorded for the locked resize path after the checkpoint:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/main-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/worktree-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/worktree-dict-resize-steady.trace.json`

All four runs replayed the same warmed loaded-tab width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the warmed steady pair, in milliseconds:

| Section | Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | --- | ---: | ---: | ---: |
| `S0 Code` | `main` | 148.2 | 6.2 | 1.4 |
| `S0 Code` | worktree | 179.6 | 7.2 | 1.2 |
| `S0 Dict` | `main` | 160.3 | 6.7 | 1.1 |
| `S0 Dict` | worktree | 178.2 | 7.7 | 1.4 |

DevTools summary:

- all four traces surfaced `CLSCulprits` and `ForcedReflow`
- `CLS 0.00` on all four traces

Interpretation:

- this checkpoint removes the surviving explicit subgrid utility usage from the locked worktree params shell
- the warmed resize path still does not beat untouched `main`
- the remaining performance cost is now even more clearly in the deeper recursive row/editor path rather than in the old wrapper/subgrid shell alone

## Conclusion

- `Phase S1` is effectively exhausted on the locked representative controls and `Phase S2` is now active.
- Checkpoint 1 removes the surviving `grid-cols-subgrid` contract from the shared params shell with no visible drift.
- The warmed resize path remains slower on the worktree for both representative controls, so the next `Phase S2` step should move deeper into the row primitive cluster (`ParamDndList` / `GetParamSwitch` / `ParamSwitch` / `ParamContainer`) rather than revisiting wrapper-only shell cleanup.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/main-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/worktree-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/main-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/worktree-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint1/worktree-dict-resize-steady.trace.json`
