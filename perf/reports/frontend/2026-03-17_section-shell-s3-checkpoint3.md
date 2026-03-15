# Section Shell Phase S3 Checkpoint 3

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S3`
Checkpoint: `3`

## Change Summary

This checkpoint extracts the shared section-area switch out of the canvas wrapper module and removes the extra canvas-only body boundary.

Code changes:

- Added `frontend/src/components/Section/Container/SectionAreaSwitch.tsx`.
- Moved the shared section-type switch plus chat-area ownership into that new module.
- Updated `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` so the canvas shell now owns only:
  - shared canvas chrome
  - the canvas-only externalized-window placeholder gate
  - the minimized gate
- Updated `frontend/src/components/Section/Container/SectionWindowSurface.tsx` so window surfaces import the shared area switch directly instead of depending on the canvas wrapper module.
- Updated focused coverage in:
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `frontend/src/components/Section/Container/SectionWindowSurface.test.tsx`

Structural intent:

- remove the extra `CanvasSectionBody` component boundary and subscription
- stop coupling window surfaces to `SectionContainerCoreResizabe.tsx`
- keep the accepted checkpoint-2 chrome seam intact while shrinking the remaining shared-shell ownership split

## Automated Verification

Focused Vitest coverage:

```bash
pnpm -C frontend exec vitest run \
  src/components/Section/Container/SectionContainerCoreResizabe.test.tsx \
  src/components/Section/Container/SectionWindowSurface.test.tsx \
  src/components/Section/Container/sectionChrome.test.ts \
  src/components/Utils/Resizable/useSectionResizeController.test.tsx \
  src/state/hooks/sectionSizes.integration.test.tsx
```

Result:

- `5` files passed
- `34` tests passed

Representative Playwright resize suite:

```bash
./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-sizing.spec.ts
```

Result:

- `8 passed`

## Chrome DevTools Visual + Geometry Check

Representative pages:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`

Representative section:

- `S0 Dict`

Locked resize path:

- start from the matched expanded `300px` state
- replay the bottom-handle shrink from `300px` to `225px`

Accepted screenshot artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/main-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/worktree-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/main-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/worktree-page-s0-dict-shrunk.png`

Visual read:

- expanded and shrunk screenshots stayed aligned between untouched `main` and the worktree
- the section header chrome, filter field, toolbar row, and visible `gamma` row remained visually aligned
- no new clipping or overflow drift appeared on the accepted shrink pair

Geometry read at the matched shrunk state:

- both branches:
  - root size: `260 x 225`
  - root `scrollHeight`: `235`
  - root `clientHeight`: `225`
  - root `overflow-y`: `visible`

Focused DOM read at the matched shrunk state:

- `main`: `68` nodes, max depth `9`
- worktree: `58` nodes, max depth `7`

Interpretation:

- this checkpoint removes another shared-shell boundary without disturbing the representative resize geometry contract
- the worktree keeps the flatter focused subtree after the shared switch extraction

## Chrome DevTools Resize Trace

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/main-s0-dict-bottom-shrink-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/worktree-s0-dict-bottom-shrink-trace.json`

The comparison below uses the target-renderer interaction window from the first `mousedown` through `mouseup + 100ms`, matching the accepted checkpoint-1 and checkpoint-2 methodology.

Target-renderer interaction-window totals from the accepted shrink pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `720.999` | `237.763` | `10.342` | `3.150` | `718.029` | `20.408` | `0.029` | `88.553` | `1.273` |
| worktree | `652.133` | `168.682` | `9.129` | `2.246` | `624.335` | `15.672` | `0.000` | `119.388` | `1.027` |

DevTools summary:

- `CLS 0.00` on both accepted shrink traces
- both traces still surface `ForcedReflow`

Interpretation:

- the worktree is clearly better on:
  - `FunctionCall`
  - `UpdateLayoutTree`
  - `Layout`
  - `Paint`
  - `RunTask`
  - `EventDispatch`
  - `Commit`
- `TimerFire` is effectively flat
- `FireAnimationFrame` is somewhat higher on the worktree, but it does not outweigh the reduction across the heavier renderer categories
- inference from the trace pair:
  - the shared `SectionAreaSwitch` extraction plus the removed `CanvasSectionBody` boundary is an acceptable `Phase S3` checkpoint
  - the next serious work should move upward into the remaining shared header/body shell invalidation and wrapper ownership, not reopen this switch extraction immediately

## Conclusion

- `Phase S3` checkpoint 3 is accepted.
- The shared section-area ownership is now clearer:
  - `SectionAreaSwitch.tsx` owns the shared section-type switch for both canvas and window surfaces
  - `SectionContainerCoreResizabe.tsx` now owns only the canvas-specific placeholder/minimized gate above that switch
  - `SectionWindowSurface.tsx` no longer depends on the canvas wrapper module to render shared section bodies
- The representative resize gate stayed green across:
  - focused Vitest coverage
  - the existing browser resize suite
  - matched untouched-`main` vs worktree CDP screenshot, geometry, DOM-read, and target-renderer trace checks
- `Phase S3` is not complete. The next pass should target higher shared-shell wrapper reduction or invalidation in `SectionContainerCore.tsx` and the shared window/canvas header-body shells above the accepted area-switch seam.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/main-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/worktree-page-s0-dict-expanded.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/main-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/worktree-page-s0-dict-shrunk.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/main-s0-dict-bottom-shrink-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint3/worktree-s0-dict-bottom-shrink-trace.json`
