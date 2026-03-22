# Section Shell Phase S3 Checkpoint 7

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S3`
Checkpoint: `7`
Branch/Commit: `frontend-performance-11` @ `9b39ab931`

## Change Summary

This checkpoint isolates standalone window-space window surfaces from unrelated sibling focus and local chat-thread churn.

Code changes:

- Updated `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx`.
- Updated `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx`.

Structural intent:

- keep `StandaloneWindowSpaceSurface` responsible for:
  - hydration
  - blocked-window bookkeeping
  - snapped-resize orchestration
  - the sorted visible-window list
- move each absolute standalone window frame plus its surface switch behind a memoized child
- stop unrelated standalone project-chat and section windows from re-entering when only:
  - a different window gains focus
  - a sibling project-chat window changes its local chat thread

Implementation detail:

- `StandaloneWindowSpaceSurface.tsx` now exposes a memoized `StandaloneWindowSpaceWindowSurface` child that owns:
  - the absolute `article` frame
  - the `SectionWindowSurface` versus `ProjectChatWindowSurface` split
  - per-window project-chat surface id wiring
  - per-window local chat-thread and embedded-git callbacks
- `StandaloneWindowSpaceSurface.tsx` now shares a single `onFocusWindow(...)` callback instead of rebuilding the same z-index update path inline for every mapped window.
- `resolveStandaloneWindowProjectChatUpdate(...)` now normalizes the function/value `SetStateAction` handling in one place for standalone chat-window updates.
- the blocked managed-chat reset tied to `hydrationKey` now skips the initial mount so an immediate blocked-window report is not cleared by the route bootstrap effect.

## Automated Verification

Focused Vitest coverage:

```bash
pnpm -C frontend exec vitest run \
  src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx \
  src/components/ChatWindowing/ProjectChatWindowSurface.test.tsx \
  src/components/Section/Container/SectionWindowSurface.test.tsx
```

Result:

- `3` files passed
- `33` tests passed

New focused guardrails:

- `StandaloneWindowSpaceSurface.test.tsx` now proves standalone sibling surfaces stay stable when:
  - a different window is focused
  - a project-chat window updates its local thread

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts \
  --grep "keeps standalone project surfaces isolated from workspace selection and windowing state"

./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts \
  --grep "project chat windows reopen canvas-bound sections as centered floating windows while keeping section chrome"
```

Result:

- `1 passed` in the standalone/window-state isolation canary
- `1 passed` in the floating-window chrome parity canary

## Chrome DevTools Standalone Window-Space Focus Trace

Representative pages:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`

Representative control:

- in-session standalone route `/{project}/windowspace/perf_focus_space`
- two-window standalone layout:
  - left `Perf Chat` project-chat window
  - right `S0 Dict` section window

Replay method:

- open fresh workspace tabs on untouched `main` and the worktree
- inject the same saved standalone window-space config into live project state on both branches
- switch to the standalone route with `history.pushState(...)` plus `PopStateEvent` so the route reuses the same in-session state and viewport
- verify both branches start with:
  - `perf-chat-window` at `zIndex 2`
  - `perf-section-window` at `zIndex 1`
- start a DevTools `Performance` trace
- mark the replay boundary with:
  - `performance.mark("s3-window-space-focus-start")`
- dispatch a deterministic `pointerdown` on the lower-z `perf-section-window`
- wait two RAFs
- mark the post-update boundary with:
  - `performance.mark("s3-window-space-focus-after-raf")`
- stop the trace and compare the target renderer from `s3-window-space-focus-start` through `+100ms`

Why this replay was used:

- this checkpoint is about standalone window-surface invalidation, not route load or resize
- focusing a lower-z sibling is the smallest repeatable action that exercises the touched `StandaloneWindowSpaceSurface` seam
- the replay keeps the section and project-chat surfaces live together so unrelated-sibling churn is measurable

Live CDP standalone-window read:

- both branches kept the same standalone window-space content:
  - `S0 Dict`
  - `ARGS`
  - filter value `gamma`
  - visible `gamma` row
  - `Perf Chat`
  - the standalone chat composer and warning banner
- both branches kept the same standalone window geometry before the trace:
  - `perf-section-window`: `x 700`, `width 700`, `height 675`, `zIndex 1`
  - `perf-chat-window`: `x 0`, `width 700`, `height 540`, `zIndex 2`
- both branches ended the replay with the same focus result:
  - `perf-section-window` promoted to `zIndex 3`
  - `perf-chat-window` stayed at `zIndex 2`

Accepted visual artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/main-standalone-window-focus.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/worktree-standalone-window-focus.png`

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/main-standalone-window-focus-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/worktree-standalone-window-focus-trace.json`

Accepted marked target-renderer totals from the focus pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `69.373` | `6.765` | `5.392` | `0.280` | `72.348` | `0.309` | `0.000` | `0.325` | `0.290` |
| worktree | `46.731` | `5.918` | `5.729` | `0.325` | `51.100` | `0.539` | `0.000` | `0.416` | `0.263` |

DevTools summary:

- `CLS 0.00` on both accepted traces

Interpretation:

- the worktree is materially better on:
  - `FunctionCall`
  - `UpdateLayoutTree`
  - `RunTask`
  - `Commit`
- the worktree is only slightly higher on:
  - `Layout`
  - `Paint`
  - `EventDispatch`
  - `FireAnimationFrame`
- this is acceptable because:
  - the heaviest scripting/task cost in the standalone focus window is lower on the worktree
  - the touched seam is specifically about avoiding unrelated sibling re-entry, and the new focused guardrails directly prove that behavior
  - the remaining tradeoffs are small relative to the `FunctionCall` and `RunTask` improvement

## Conclusion

- `Phase S3` checkpoint 7 is accepted.
- `StandaloneWindowSpaceSurface` now has a clearer split:
  - the parent owns hydration, filtering, and resize orchestration
  - the memoized per-window child owns the absolute frame plus surface-specific rendering
- the representative standalone focus replay now favors the worktree on the dominant scripting buckets, and the stronger evidence is the new focused invalidation coverage.
- `Phase S3` is not complete. The next serious step should move outward into route-level or remaining shared floating chat/window ownership above this accepted standalone per-window seam, not reopen the memoized window child unless a later trace proves it necessary.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/main-standalone-window-focus.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/worktree-standalone-window-focus.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/main-standalone-window-focus-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint7/worktree-standalone-window-focus-trace.json`
