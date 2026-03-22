# Section Shell Phase S3 Checkpoint 5

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S3`
Checkpoint: `5`

## Change Summary

This checkpoint moves shared section-surface chrome ownership into `sectionChrome` so the canvas and window shells consume the same base chrome model.

Code changes:

- Updated `frontend/src/components/Section/Container/sectionChrome.ts`.
- Updated `frontend/src/components/Section/Container/SectionWindowSurface.tsx`.
- Updated `frontend/src/components/Section/Container/sectionChrome.test.ts`.
- Updated `frontend/src/components/Section/Container/SectionWindowSurface.test.tsx`.

Structural intent:

- centralize shared section-surface decisions for:
  - `bgColor`
  - meta-control mode
  - inner surface frame classes
- keep `getCanvasSectionChrome(...)` as the thin canvas wrapper above that shared model
- move window-shell class construction behind `getWindowSectionChrome(...)`
- keep real ownership seams unchanged:
  - `SectionAreaSwitch`
  - `bodyOverride`
  - the canvas externalized-window placeholder gate
  - the canvas minimized gate

Implementation detail:

- `sectionChrome.ts` now exposes:
  - `getSectionSurfaceMode(...)`
  - `getCanvasSectionChrome(...)`
  - `getWindowSectionChrome(...)`
- `SectionWindowSurface.tsx` no longer recomputes its outer and inner shell classes inline.
- `SectionWindowSurface.tsx` now consumes the shared window descriptor and only keeps:
  - section-style theme variable derivation
  - `SectionHeader`
  - the window body wrapper
  - `SectionAreaSwitch` / `bodyOverride`

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
- `16` tests passed

New focused guardrails:

- `sectionChrome.test.ts` now covers `getWindowSectionChrome(...)` full-bleed standalone output.
- `SectionWindowSurface.test.tsx` now proves:
  - standalone full-bleed decisions route through the shared helper
  - explicit `bodyOverride` content stays outside the shared area-switch path

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/sections/section-sizing.spec.ts

./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts \
  --grep "project chat windows reopen canvas-bound sections as centered floating windows while keeping section chrome"
```

Result:

- `8 passed` in `section-sizing.spec.ts`
- `1 passed` in the floating-window chrome parity check

## Chrome DevTools Visual Check

Representative pages:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`

Representative control:

- `S0 Dict`

Floating-window visual replay:

- move `S0 Dict` into a floating section window on both branches
- capture matched viewport screenshots of the reopened `section-window-surface`
- confirm the canvas placeholder copy remains aligned with the floating surface state

Accepted screenshot artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/main-page-s0-dict-window-surface.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/worktree-page-s0-dict-window-surface.png`

Visual read:

- the floating `S0 Dict` header chrome, window controls, body shell, args toolbar, and visible `gamma` row stayed aligned between untouched `main` and the worktree
- the canvas placeholder state still matched the floating-window ownership handoff
- no new border/radius drift appeared in the standalone floating surface after the shared helper move

## Chrome DevTools Resize Trace

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/main-s0-dict-300-to-225-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/worktree-s0-dict-300-to-225-trace.json`

Representative replay:

- restore `S0 Dict` to the canvas on both branches
- set the section to `300 x 300`
- wait for the shell to settle
- trace a deterministic shrink to `225 x 225` via `route_set_section_sizes(...)`

Accepted target-renderer totals from the rerun pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `476.562` | `9.243` | `1.302` | `0.042` | `529.438` | `0.209` | `243.827` | `0.934` |
| worktree | `333.795` | `9.491` | `1.707` | `0.762` | `392.411` | `0.352` | `121.873` | `1.265` |

DevTools summary:

- `CLS 0.00` on both accepted resize traces

Interpretation:

- the worktree is materially better on:
  - `FunctionCall`
  - `RunTask`
  - `TimerFire`
- the worktree is only slightly higher on:
  - `UpdateLayoutTree`
  - `Layout`
  - `Paint`
  - `EventDispatch`
  - `Commit`
- this checkpoint is a shared ownership move, not a wrapper-removal pass, and the representative resize gate stayed flat enough to accept it

## Conclusion

- `Phase S3` checkpoint 5 is accepted.
- Canvas and window section shells now share the same base surface-chrome model.
- The representative gate stayed acceptable across:
  - focused Vitest coverage
  - existing resize and floating-window Playwright coverage
  - matched untouched-`main` vs worktree CDP screenshot and resize-trace checks
- `Phase S3` is not complete. The next serious pass should target real body-shell or theme-state invalidation reduction above this accepted shared chrome model, not reopen the placeholder, `bodyOverride`, or `SectionAreaSwitch` seams.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/main-page-s0-dict-window-surface.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/worktree-page-s0-dict-window-surface.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/main-s0-dict-300-to-225-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint5/worktree-s0-dict-300-to-225-trace.json`
