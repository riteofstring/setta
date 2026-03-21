# Shared Section-Shell S3 Checkpoint 2

Date: 2026-03-17
Area: frontend
Branch/Commit: `frontend-performance-11` @ `19d990583`
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Accept the next `Phase S3` boundary by moving canvas surface chrome ownership out of `CustomResizable` and into `sectionChrome.ts` / `SectionContainerCoreResizabe.tsx`, while keeping the visible section shell and resize-handle behavior stable.

## Scope

Updated:

- `frontend/src/components/Section/Container/sectionChrome.ts`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
- `frontend/src/components/Section/Container/sectionChrome.test.ts`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

What moved upward into the shared chrome helper:

- canvas `bgColor` selection
- shared surface class recipe for the canvas section body
- meta-control drag-handle visibility
- meta-control vs text-block-meta vs standard-header variant selection

What stayed in the resize shell:

- `useSectionResizeController` ownership
- runtime pointer-event gating during DnD
- resize-handle geometry and active-handle styling
- the `id={`${sectionId}-CustomResizable`}` DOM contract

Why this counts as `Phase S3`:

- it removes more shared section-surface ownership from `CustomResizable`
- it keeps the same section DOM layering while making the higher shell boundary easier to reason about and test

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionChrome.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Utils/Resizable/useSectionResizeController.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `4` files passed, `32` tests passed

What the new focused coverage now pins:

- `getCanvasSectionChrome` keeps real meta-control and text-block-meta-control variants distinct
- `SectionContainerCoreResizabe` routes the shared descriptor through `CustomResizable`
- the accepted checkpoint-1 controller seam still holds alongside the new chrome seam

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `8 passed`

Why this gate was kept:

- the checkpoint still touches the shared resize shell and meta-control chrome path
- the existing browser suite already covers the visible resize-handle and auto-height regressions that would surface a parity mistake here

## CDP Visual Verification

Representative scenes used for the acceptance read:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`
- representative section:
  - `S0 Dict`

The same representative resize flow from checkpoint 1 was reused:

- start from matched `300px` height
- drag the bottom resize handle upward until the section settles at `225px`

Saved screenshot artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/main-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/worktree-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/main-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/worktree-page-s0-dict-shrunk.png`

Useful CDP read for this checkpoint:

- live page snapshots around the `S0 Dict` section stayed aligned across `main` and the worktree during the replay
- the full-page screenshots were kept as append-only artifacts, but the acceptance read here relied primarily on:
  - matched page snapshots
  - live geometry readback
  - the resize trace pair below

Geometry readback:

- expanded state on both branches:
  - root size: `260 x 300`
  - filter field remained inside the resizable root
  - `overflow-y` stayed `visible`
- shrunk state on both branches:
  - root size: `260 x 225`
  - filter field remained inside the resizable root
  - `scrollHeight`: `235`
  - `clientHeight`: `225`
  - `overflow-y` stayed `visible`

Interpretation:

- the canvas-surface ownership move did not disturb the representative `S0 Dict` geometry contract
- the shared section shell still settled to the same matched expanded and shrunk sizes on both branches

## Chrome DevTools Resize Trace

Accepted touched interaction:

- start from the matched `300px` `S0 Dict` height on both branches
- drag the bottom resize handle upward until the section settles at `225px`

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/main-s0-dict-bottom-shrink-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/worktree-s0-dict-bottom-shrink-trace.json`

As with checkpoint 1, the comparison below uses the target-renderer interaction window from the first `mousedown` through `mouseup + 100ms`, not a raw whole-trace sum.

Target-renderer interaction-window totals from the accepted shrink pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `1145.367` | `277.639` | `13.279` | `4.365` | `1303.913` | `29.920` | `0.177` | `218.506` | `1.857` |
| worktree | `1176.440` | `279.094` | `16.372` | `4.737` | `1133.181` | `28.888` | `0.050` | `124.627` | `0.588` |

DevTools summary:

- `CLS 0.00` on both accepted shrink traces
- both traces still surface `ForcedReflow`, so the shared section-shell invalidation work remains above this ownership move

Interpretation:

- the worktree is somewhat higher on:
  - `FunctionCall`
  - `UpdateLayoutTree`
  - `Layout`
  - `Paint`
- the worktree is materially better on:
  - `RunTask`
  - `FireAnimationFrame`
  - `Commit`
- `EventDispatch` and `TimerFire` stayed effectively flat
- inference from the trace stacks:
  - this checkpoint moved ownership in the right direction without introducing a representative resize regression
  - the next serious `Phase S3` step should target real wrapper reduction or higher shell invalidation, not reopen the surface-class plumbing again immediately

## Conclusion

- `Phase S3` checkpoint 2 is accepted.
- The shared canvas-surface chrome contract is now more explicit:
  - `sectionChrome.ts` owns the canvas chrome descriptor
  - `SectionContainerCoreResizabe.tsx` owns the section-chrome variant selection
  - `CustomResizable` now consumes a prepared surface class instead of rebuilding shared chrome from scattered flags
- The representative resize gate stayed green across:
  - focused chrome + container tests
  - the accepted checkpoint-1 controller tests
  - the existing browser resize suite
  - matched untouched-`main` vs worktree CDP snapshot/geometry/trace reads
- `Phase S3` is not complete. The next pass should target real shared-shell wrapper reduction or invalidation above this plumbing seam.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/main-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/worktree-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/main-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/worktree-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/main-s0-dict-bottom-shrink-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint2/worktree-s0-dict-bottom-shrink-trace.json`
