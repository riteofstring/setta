# Section Shell Phase S3 Checkpoint 6

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S3`
Checkpoint: `6`
Branch/Commit: `frontend-performance-11` @ `ae81d834d`

## Change Summary

This checkpoint isolates the floating `SectionWindowSurface` body path from durable active-id churn and preview-theme churn.

Code changes:

- Updated `frontend/src/components/Section/Container/SectionWindowSurface.tsx`.
- Updated `frontend/src/components/Section/Container/SectionWindowSurface.test.tsx`.

Structural intent:

- keep `SectionWindowSurface` responsible for:
  - the outer floating shell
  - section-style theme vars
  - `SectionHeader`
- move the body wrapper plus `SectionAreaSwitch` / `bodyOverride` handoff into a memoized child
- stop the floating window body subtree from re-entering on:
  - durable active-id changes
  - preview-theme-only changes

Implementation detail:

- `SectionWindowSurface.tsx` no longer subscribes to `state.projectConfig.activeIds.includes(sectionId)`.
- `SectionWindowSurface.tsx` now passes `isActiveSection: false` into `getWindowSectionChrome(...)`, matching the existing forced-hide-outline window shell behavior.
- `SectionWindowSurfaceBody` is now a memoized child that owns:
  - the `section-main-full-w` wrapper
  - `bodyOverride`
  - the shared `SectionAreaSwitch` path

## Automated Verification

Focused Vitest coverage:

```bash
pnpm -C frontend exec vitest run \
  src/components/Section/Container/sectionChrome.test.ts \
  src/components/Section/Container/SectionWindowSurface.test.tsx \
  src/components/Section/Container/SectionContainerCoreResizabe.test.tsx \
  src/components/Section/Container/SectionContainerCore.test.tsx
```

Result:

- `4` files passed
- `18` tests passed

New focused guardrails:

- `SectionWindowSurface.test.tsx` now proves the floating window body subtree stays stable when only:
  - durable `activeIds` change
  - preview style-color state changes

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts \
  --grep "project chat windows reopen canvas-bound sections as centered floating windows while keeping section chrome"

./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts \
  --grep "keeps standalone project surfaces isolated from workspace selection and windowing state"
```

Result:

- `1 passed` in the floating-window chrome parity canary
- `1 passed` in the standalone/window-state isolation canary

## Chrome DevTools Window Read + Activation Trace

Representative pages:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`

Representative control:

- floated `S0 Dict`

Replay method:

- open `S0 Dict` as a floating section window on both branches
- precondition both branches to `S0 Code` active with:
  - `setActiveSectionIds([codeSectionId], { syncMode: "ui-only" })`
- start a DevTools `Performance` trace
- mark the active-id boundary inside the page with:
  - `performance.mark("s3-window-active-start")`
- switch the active section to the floated `S0 Dict` with:
  - `setActiveSectionIds([dictSectionId], { syncMode: "ui-only" })`
- mark the first post-update RAF with:
  - `performance.mark("s3-window-active-after-raf")`
- stop the trace and read the target renderer from `TracingStartedInBrowser`
- compare the target-renderer interaction window from `s3-window-active-start` through `+100ms`

Why this replay was used:

- the first click-based activation attempt was noisier than the touched invalidation seam
- this checkpoint is about floating-window invalidation, not click-dispatch plumbing
- the marked UI-only replay isolates the state change the checkpoint actually touches

Live CDP floated-window read:

- both branches kept the same floated surface content:
  - title `S0 Dict`
  - `ARGS`
  - filter value `gamma`
  - `IN beta`
  - `OUT`
  - `PINNED PARAMS`
  - visible `gamma` row
- both branches kept the same floated window size:
  - width `820`
  - height `687.3984375`
- node-cropped screenshot capture was unreliable on this scene, so the final visual parity read used:
  - live CDP accessibility snapshots of the floated surface subtree
  - DOM geometry readback of the same `section-window-surface`

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/main-s0-code-to-dict-window-activation-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/worktree-s0-code-to-dict-window-activation-trace.json`

Accepted marked target-renderer totals from the active-id pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `49.891` | `1.738` | `0.000` | `0.238` | `37.321` | `0.000` | `0.000` | `0.106` | `0.116` |
| worktree | `48.823` | `1.592` | `0.000` | `0.192` | `3.125` | `0.000` | `0.000` | `0.083` | `0.167` |

DevTools summary:

- `CLS 0.00` on both accepted traces

Interpretation:

- the worktree is better on:
  - `FunctionCall`
  - `UpdateLayoutTree`
  - `Paint`
  - `RunTask`
  - `FireAnimationFrame`
- `Layout`, `EventDispatch`, and `TimerFire` stayed flat at this replay granularity
- `Commit` is slightly higher on the worktree
- this is acceptable because:
  - the touched marked window is cleaner than the earlier click replay
  - the worktree materially lowers the main scripting/task cost in the active-id invalidation window
  - the new focused guardrails directly prove the intended render-path isolation

## Conclusion

- `Phase S3` checkpoint 6 is accepted.
- `SectionWindowSurface` now has a clearer split:
  - the outer floating shell owns header/style churn
  - the memoized body child owns the expensive body subtree
- the marked active-id replay points in the right direction, and the stronger evidence is the new focused invalidation coverage.
- `Phase S3` is not complete. The next serious step should move outward into higher shared floating/window consumers above this accepted body seam, not reopen the new body memo boundary unless a later trace proves it necessary.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/main-page-s0-code-active-with-dict-window.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/worktree-page-s0-code-active-with-dict-window.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/main-page-s0-dict-active-with-window.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/worktree-page-s0-dict-active-with-window.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/main-s0-code-to-dict-window-activation-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint6/worktree-s0-code-to-dict-window-activation-trace.json`
