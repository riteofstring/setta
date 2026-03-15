# Shared Section-Shell S2 Checkpoint 2

Date: 2026-03-17
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Continue `Phase S2` by removing the special nested-parent row shell in `ParamContainer` so parent rows use the same shared row primitive as leaf rows, while preserving the locked `S0 Code` / `S0 Dict` scenes.

## Scope

Updated `frontend/src/components/Params/ParamContainer.tsx`:

- removed the special `section-args-nested section-lg-value` parent-row branch
- rendered nested child `GetParamSwitch` output as sibling rows after the parent `<article>`
- kept DnD hooks, hover chrome, selection handlers, and leaf-row widget/error ownership intact

Updated `frontend/src/components/Params/ParamSwitch.tsx` and `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`:

- moved the parent-row label ownership into `ParamTextLabel` via `hasChildren`
- kept the existing nested-child visual rail on child rows instead of parent-owned label hacks

Updated verification coverage:

- added a shared-shell SSR canary in `frontend/src/components/Params/GroupContainer.test.tsx` for sibling nested rows
- updated `frontend/tests/e2e/params/callable-minimum-regression.spec.ts` so the browser regression asserts the new flattened sibling contract

Why this checkpoint belongs to `Phase S2`:

- this removes a real recursive row-contract branch, not a decorative wrapper
- the surviving special-case shell was inside the shared row primitive cluster called out at the end of checkpoint 1
- the change simplifies recursive ownership without altering DnD or selection flows

## DOM Read

Locked scenes:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- representative sections:
  - `S0 Code`
  - `S0 Dict`

Live DOM audit after the checkpoint:

| Section | Branch | Nodes | Max depth | `section-args-nested` rows | Nested-child rows |
| --- | --- | ---: | ---: | ---: | ---: |
| `S0 Code` | `main` | 115 | 12 | 0 | 0 |
| `S0 Code` | worktree | 114 | 12 | 0 | 0 |
| `S0 Dict` | `main` | 100 | 14 | 1 | 0 |
| `S0 Dict` | worktree | 80 | 11 | 0 | 1 |

Key read:

- the worktree removes the remaining nested-parent `section-args-nested` row shell from the locked `S0 Dict` scene
- the nested `delta` row is now a sibling after `gamma` instead of a descendant inside the parent row shell
- `S0 Dict` stays materially flatter than untouched `main` by `20` nodes and `3` depth levels
- `S0 Code` remains effectively unchanged, which keeps it useful as the shared resize/editor control

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `4` files passed, `24` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
- result: `19 passed`

Why these gates were chosen:

- shared row-class and Dict-shell markup coverage
- section sizing integration on the same resize path used by the DevTools traces
- direct Dict/shared-shell interaction coverage
- callable reorder/indent regression coverage for the nested-row contract that changed in this checkpoint

## CDP Visual Verification

Chrome DevTools screenshots were taken on `S0 Code` and `S0 Dict` for both branches.

Visual read:

- `S0 Code` header title, diagnostics pill, editor surface, and right-side actions remained aligned
- `S0 Dict` header title, arg toolbar, edge strip, pinned header, and divider line remained aligned
- the nested `delta` row still reads as a child of `gamma` visually through indentation and the left rail, with no obvious drift from untouched `main`

## Chrome DevTools Resize Trace

Chrome DevTools `Performance` traces were recorded for the locked resize path after the checkpoint:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/main-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/worktree-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/worktree-dict-resize-steady.trace.json`

All four runs replayed the same warmed loaded-tab width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the warmed steady pair, in milliseconds:

| Section | Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | --- | ---: | ---: | ---: |
| `S0 Code` | `main` | 208.0 | 9.1 | 2.3 |
| `S0 Code` | worktree | 260.5 | 10.2 | 3.2 |
| `S0 Dict` | `main` | 185.5 | 8.6 | 1.5 |
| `S0 Dict` | worktree | 217.2 | 9.7 | 1.9 |

DevTools summary:

- all four traces surfaced `CLSCulprits` and `ForcedReflow`
- `CLS 0.00` on all four traces

Interpretation:

- this checkpoint removes the remaining special nested-parent row shell from the locked worktree `Dict` scene and keeps parity
- the warmed resize path still favors untouched `main` on both representative controls
- the remaining performance cost is now more clearly in the surviving shared row/list orchestration and resize path, not in the old parent-row branch itself

## Conclusion

- `Phase S2` remains active.
- Checkpoint 2 removes the special nested-parent row shell with no visible drift and updates the nested-row browser regression to the new sibling contract.
- The warmed resize path is still slower on the worktree for both representative controls, so the next `Phase S2` step should move deeper into `GetParamSwitch` / `ParamDndList` and the surviving shared `section-param-row` contract rather than revisiting the removed parent-row branch.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/main-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/worktree-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/main-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/worktree-code-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/main-dict-resize-steady.trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint2/worktree-dict-resize-steady.trace.json`
