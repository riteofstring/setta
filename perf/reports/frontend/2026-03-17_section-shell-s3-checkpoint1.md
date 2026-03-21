# Shared Section-Shell S3 Checkpoint 1

Date: 2026-03-17
Area: frontend
Branch/Commit: `frontend-performance-11` @ `677b5d643`
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Accept the first `Phase S3` boundary by extracting the shared resize/session controller out of `CustomResizable` without changing the visible section shell or resize-handle behavior.

## Scope

Added:

- `frontend/src/components/Utils/Resizable/useSectionResizeController.ts`
- `frontend/src/components/Utils/Resizable/useSectionResizeController.test.tsx`

Updated:

- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`

Removed:

- `frontend/src/components/Utils/Resizable/CustomResizable.test.ts`

What moved into the new controller hook:

- auto-size promotion at resize start
- resize session refs and start/end bookkeeping
- persisted size commit wiring
- clamp / propagation helpers
- resize-stop normalization and double-click reset handling

What stayed in the shell:

- `CustomResizable` public props
- the `id={`${sectionId}-CustomResizable`}` DOM contract
- `CustomResizableSuperCore` handle rendering, classes, pointer-event gating, and `ResizableWithScale` composition

Why this counts as `Phase S3`:

- it moves ownership out of the shared resize shell rather than flattening deeper param-row structure
- it keeps the visible section frame stable while making the resize path easier to reason about and test

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Utils/Resizable/useSectionResizeController.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `3` files passed, `26` tests passed

What the new hook-level coverage now pins:

- auto-height promotion on first drag
- resize-event start sequencing
- zero-delta double-click reset back to `"auto"`
- zero-delta stop without a real resize attempt

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-sizing.spec.ts`
- result: `8 passed`

Why these gates were kept:

- the new Vitest file covers the controller seam directly instead of only pure helper functions
- the existing `section-sizing` browser suite already carries the user-visible resize contract and overflow/minimum regressions

## CDP Visual Verification

Representative scenes used for the acceptance read:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`
- representative section:
  - `S0 Dict`

Chrome DevTools was used to capture viewport screenshots on both branches at two matched resize states:

- expanded state: `300px` section height
- shrunk state: `225px` section height

Saved screenshot artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/main-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/worktree-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/main-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/worktree-page-s0-dict-shrunk.png`

Additional geometry readback at the matched shrunk state on both branches:

- root size: `260 x 225`
- filter field remained inside the resizable root
- visible `gamma` row remained inside the resizable root
- `overflow-y` stayed `visible`

Interpretation:

- the shared shell still presents the same `S0 Dict` focused state on both branches after the controller extraction
- the new controller boundary did not disturb the visible filter/row placement or the resize-root geometry contract used by the representative dict scene

## Chrome DevTools Resize Trace

Important trace-method note:

- the first exploratory worktree grow trace was polluted by same-origin renderer sharing because multiple `127.0.0.1:3011` tabs were open at once
- that exploratory pair is kept as local append-only evidence, but it is not the acceptance pair for this checkpoint
- the accepted pair below was taken after isolating the worktree to a single app tab and replaying the same matched resize interaction on both branches

Accepted touched interaction:

- start from the matched `300px` `S0 Dict` height on both branches
- drag the bottom resize handle upward until the section settles at `225px`

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/main-s0-dict-bottom-shrink-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/worktree-s0-dict-bottom-shrink-trace.json`

Because DevTools trace start/stop itself adds idle/background time between tool calls, the comparison below uses the target-renderer interaction window from the first `mousedown` through `mouseup + 100ms`, not a raw whole-trace sum.

Target-renderer interaction-window totals from the accepted shrink pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `1160.906` | `276.278` | `12.301` | `3.081` | `1138.690` | `21.004` | `213.680` | `2.235` | `1.936` |
| worktree | `1155.106` | `277.188` | `15.193` | `4.011` | `1134.535` | `20.723` | `112.510` | `3.529` | `2.190` |

DevTools summary:

- `CLS 0.00` on both accepted shrink traces
- both traces also surfaced a `ForcedReflow` insight, which means the controller extraction did not remove the deeper resize-path invalidation work by itself

Interpretation:

- the accepted pair is close enough to treat the controller extraction as performance-neutral for this representative resize path
- the worktree edges out `main` on:
  - `FunctionCall`
  - `RunTask`
  - `EventDispatch`
  - `TimerFire`
- `main` stays somewhat better on:
  - `UpdateLayoutTree`
  - `Layout`
  - `Paint`
  - `FireAnimationFrame`
  - `Commit`
- inference from the trace stacks:
  - the dominant cost is still shared `re-resizable` / invalidation / edge-handle work around the section shell, not the newly extracted controller boundary itself
  - the next serious `Phase S3` step should move outward into `SectionContainerCoreResizabe` / `sectionChrome` ownership instead of reworking the controller again immediately

## Conclusion

- `Phase S3` checkpoint 1 is accepted.
- The resize/session boundary is now explicit and testable:
  - `useSectionResizeController` owns the session lifecycle and persisted commit path
  - `CustomResizable` remains the visible shell/composition wrapper
- The focused resize verification stayed green across:
  - direct hook coverage
  - nearby size-dimension integration coverage
  - existing browser resize regressions
  - matched untouched-`main` vs worktree CDP screenshot/trace reads
- This checkpoint improves ownership and testability without introducing a clear representative resize regression.
- `Phase S3` is not complete. The next pass should target higher shared-shell/layout ownership, not reopen the controller split.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/main-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/worktree-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/main-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/worktree-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/main-s0-dict-bottom-resize-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/worktree-s0-dict-bottom-resize-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/main-s0-dict-bottom-shrink-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint1/worktree-s0-dict-bottom-shrink-trace.json`
