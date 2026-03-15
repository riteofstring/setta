# Shared Section-Shell S1 Checkpoint 1

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Land the first accepted `Phase S1` wrapper-reduction checkpoint on the locked `S0 Dict` shared-shell scene.

## Scope

Updated `frontend/src/components/Params/GroupContainer.tsx`:

- collapsed the outer unpinned-area wrapper so the real scroll container is now the direct flex child
- collapsed the edge-strip center divider from two DOM nodes to one

Why this checkpoint was accepted:

- the unpinned scroll container already owned the real behavior:
  - `ref={setContainerRef}`
  - `overflow-y-scroll`
  - min-height style
  - `ParamDndList`
- the removed outer wrapper did not carry refs, listeners, DnD ownership, or measurement ownership
- the divider wrapper was purely visual

## DOM Read

Locked scene:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- section: `S0 Dict`

Live DOM audit on the locked `S0 Dict` section after the checkpoint:

| Branch | Nodes | Max depth |
| --- | ---: | ---: |
| `main` | 92 | 11 |
| worktree | 77 | 9 |

Wrapper-only candidates from the same live read:

- `main`
  - `div.setta-prevent-section-active-css`
  - `div.pointer-events-none.flex.items-stretch.justify-center`
- worktree
  - `div.setta-prevent-section-active-css`

Key read:

- this checkpoint removed at least one wrapper-only node from the locked shared-shell `Dict` scene
- the worktree `S0 Dict` section is now materially flatter than untouched `main` on the same current read

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
- center divider remained vertically centered
- pinned header and pinned row remained aligned
- unpinned `gamma` / nested `delta` geometry remained visually aligned with untouched `main`
- no visible drift was accepted in the shared `Dict` shell

## Chrome DevTools Resize Trace

Fresh Chrome DevTools `Performance` traces were recorded for the locked `S0 Dict` resize path after the checkpoint:

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint1/main-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint1/worktree-dict-resize.trace.json`

Both runs replayed the same screen-state width sequence:

- before: `350px`
- expanded: `400px`
- restored: `350px`

Aggregate event totals from the saved traces, in milliseconds:

| Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | ---: | ---: | ---: |
| `main` | 31.9 | 7.2 | 3.0 |
| worktree | 44.8 | 4.9 | 7.4 |

DevTools summary:

- `main`: `CLSCulprits` only, `CLS 0.00`
- worktree: `CLSCulprits` only, `CLS 0.00`
- no `ForcedReflow` insight surfaced on either branch in this checkpoint rerun

Interpretation:

- this checkpoint earns the DOM simplification win
- it does not yet earn a resize-path performance win
- the shared resize path still costs more on the worktree than on untouched `main`

## Conclusion

- `Phase S1` is now active with one accepted checkpoint.
- The first shared-shell wrapper reduction landed without behavioral or visual drift.
- The branch is flatter on the locked `S0 Dict` scene, but shared resize cost is still not improved.
- The next S1 step should continue wrapper/decorative flattening inside the shared `Dict` shell without claiming the resize-path problem is solved.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint1/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint1/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint1/main-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s1-checkpoint1/worktree-dict-resize.trace.json`
