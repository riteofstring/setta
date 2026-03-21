# Section Shell Phase S3 Checkpoint 4

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S3`
Checkpoint: `4`

## Change Summary

This checkpoint isolates the `SectionContainerCore` active-shell path from the static edge-handle and resizable body subtree.

Code changes:

- Updated `frontend/src/components/Section/Container/SectionContainerCore.tsx`.
- Added `frontend/src/components/Section/Container/SectionContainerCore.test.tsx`.

Structural intent:

- keep `SectionContainerCore` responsible for the outer active/highlight shell only
- move the non-active shell subtree into a memoized static child
- stop plain active-state churn from re-entering the edge-handle and resizable body path

Implementation detail:

- `SectionContainerCore` now renders a memoized `SectionContainerCoreStaticContent` child that owns:
  - shared chat / agentic / workflow edge-handle routing
  - `MinimizedDataEdgeHandles`
  - `SectionContainerCoreResizable`
- the outer `<section>` continues to own:
  - active z-layer
  - AI/scope highlight classes
  - joined-corner / outline / theme shell styling
  - viewport-interaction layer promotion

## Automated Verification

Focused Vitest coverage:

```bash
pnpm -C frontend exec vitest run \
  src/components/Section/Container/SectionContainerCore.test.tsx \
  src/components/Section/Container/SectionContainerCoreResizabe.test.tsx \
  src/components/Section/Container/SectionWindowSurface.test.tsx \
  src/components/Section/Container/sectionChrome.test.ts \
  src/components/Utils/Resizable/useSectionResizeController.test.tsx \
  src/state/hooks/sectionSizes.integration.test.tsx
```

Result:

- `6` files passed
- `36` tests passed

New focused guardrail:

- `SectionContainerCore.test.tsx` now proves that an active-only shell change does not rerender:
  - the edge-handle subtree
  - `MinimizedDataEdgeHandles`
  - `SectionContainerCoreResizable`

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/sections/active-section-same-generation-ownership.spec.ts \
  frontend/tests/e2e/sections/section-sizing.spec.ts
```

Result:

- `9 passed`

## Chrome DevTools Visual + Activation Check

Representative pages:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`

Representative controls:

- `S0 Code`
- `S0 Dict`

Activation replay:

- precondition both branches to `S0 Code` active
- capture screenshots of the preconditioned state
- trace a direct section-root click that activates `S0 Dict`
- capture screenshots of the final `S0 Dict` active state

Accepted screenshot artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/main-page-s0-code-active.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/worktree-page-s0-code-active.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/main-page-s0-dict-active-after-click.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/worktree-page-s0-dict-active-after-click.png`

Visual read:

- the active shell outline, header chrome, and section body stayed aligned between untouched `main` and the worktree in both the `S0 Code` and `S0 Dict` active states
- no new layout shift or shell/body separation appeared during the click replay

## Chrome DevTools Activation Trace

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/main-s0-code-to-dict-activation-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/worktree-s0-code-to-dict-activation-trace.json`

Because this checkpoint targets active-shell invalidation rather than resize, the comparison below uses the target-renderer interaction window from the first traced `click` `EventDispatch` through `click + 100ms`.

Target-renderer interaction-window totals from the accepted activation pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `40.959` | `3.069` | `0.000` | `0.184` | `8.989` | `0.468` | `0.000` | `0.473` | `0.229` |
| worktree | `42.353` | `3.241` | `0.000` | `0.209` | `5.859` | `1.258` | `0.000` | `0.504` | `0.157` |

DevTools summary:

- `CLS 0.00` on both accepted activation traces

Interpretation:

- the worktree is better on:
  - `RunTask`
  - `Commit`
- the worktree is slightly higher on:
  - `FunctionCall`
  - `UpdateLayoutTree`
  - `Paint`
  - `EventDispatch`
  - `FireAnimationFrame`
- the touched activation path is small overall, and the pair stays effectively flat enough to accept this structural isolation checkpoint
- the stronger evidence for this pass is the new invalidation guardrail:
  - active-only changes no longer rerender the static shell subtree in unit coverage

## Conclusion

- `Phase S3` checkpoint 4 is accepted.
- `SectionContainerCore` now has a clearer split:
  - the outer shell owns active/highlight/style churn
  - the memoized static child owns edge handles and the resizable body path
- The representative activation gate stayed effectively flat across:
  - focused Vitest coverage with a new active-shell rerender guardrail
  - existing activation + resize Playwright coverage
  - matched untouched-`main` vs worktree CDP screenshot and activation-trace checks
- `Phase S3` is not complete. The next serious pass should move to the broader shared section-surface shell ownership split between `SectionContainerCoreResizabe.tsx`, `SectionWindowSurface.tsx`, and `sectionChrome.ts` above this accepted active-shell isolation seam.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/main-page-s0-code-active.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/worktree-page-s0-code-active.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/main-page-s0-dict-active-after-click.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/worktree-page-s0-dict-active-after-click.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/main-s0-code-to-dict-activation-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint4/worktree-s0-code-to-dict-activation-trace.json`
