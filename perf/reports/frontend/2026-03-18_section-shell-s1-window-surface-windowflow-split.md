## Purpose

Take the first narrow higher-seam pass above accepted `Phase S1` checkpoint 1 by removing the shared `section-grid-*` inner shell from window-only surfaces before touching the remaining canvas-side `sectionChrome` path.

## Files

- `frontend/src/components/Section/Container/sectionChrome.ts`
- `frontend/src/components/ChatWindowing/ProjectChatWindowSurface.tsx`
- `frontend/src/components/Section/Container/sectionChrome.test.ts`

## Change

- Added `surfaceLayout` to `getSectionSurfaceClassName(...)`.
- Kept the existing shared grid recipe as the default `grid` mode.
- Added a `windowFlow` mode that uses `flex min-h-0 flex-col` and omits `section-grid-cols`, `section-grid-rows`, and `section-grid-areas`.
- Switched `getWindowSectionChrome(...)` to `surfaceLayout: "windowFlow"`.
- Switched `ProjectChatWindowSurface.tsx` to the same `windowFlow` inner shell.

## Untouched `main` baseline

Control scenes:

- floating section window: `http://127.0.0.1:3087/marsh_zooming`
- standalone section route: `http://127.0.0.1:3087/marsh_zooming/section/global_variables`

Floating `GlobalVariables` inner shell on untouched `main`:

- class contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
  - `grid`
- computed read:
  - `display: grid`
  - `gridTemplateColumns: [c1] 12px [c2] 391px [c3] 12px [c4] 391px [c5] 12px [c6]`
  - `gridTemplateRows: [r1] 4px [r2] 22px [r3] 0px [r4] 0px [r5] 0px [r6] 598px [r7] 4px [r8]`
  - bounds: `818 x 628`

Standalone `GlobalVariables` inner shell on untouched `main`:

- class contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
  - `grid`
- computed read:
  - `display: grid`
  - `gridTemplateColumns: [c1] 12px [c2] 682px [c3] 12px [c4] 682px [c5] 12px [c6]`
  - `gridTemplateRows: [r1] 4px [r2] 22px [r3] 0px [r4] 0px [r5] 0px [r6] 870px [r7] 4px [r8]`
  - bounds: `1400 x 900`

## Worktree scene

Clean disposable worktree scene:

- backend: `http://127.0.0.1:8211`
- frontend: `http://127.0.0.1:3211`
- project: `lively_rising`

Setup:

- bootstrapped a fresh session from `/tmp/setta_files_dev/runtime/sessions/9228c8`
- created disposable project `lively_rising`
- created a disposable `GlobalVariables` section and added the first kwarg row
- opened the section in a floating window
- undocked the first project chat window

Floating `GlobalVariables` inner shell on the worktree:

- class contains:
  - `flex`
  - `min-h-0`
  - `flex-col`
- class no longer contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
- computed read:
  - `display: flex`
  - `flexDirection: column`
  - `gridTemplateColumns: none`
  - `gridTemplateRows: none`
  - bounds: `818 x 628`

Standalone `GlobalVariables` inner shell on the worktree:

- class contains:
  - `flex`
  - `min-h-0`
  - `flex-col`
- class no longer contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
- computed read:
  - `display: flex`
  - `flexDirection: column`
  - `gridTemplateColumns: none`
  - `gridTemplateRows: none`
  - bounds: `1400 x 900`

Floating project chat inner shell on the worktree:

- class contains:
  - `flex`
  - `min-h-0`
  - `flex-col`
- class no longer contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
- computed read:
  - `display: flex`
  - `flexDirection: column`
  - `gridTemplateColumns: none`
  - `gridTemplateRows: none`
  - bounds: `818 x 518`

## Visual check

- Untouched `main` and worktree floating `GlobalVariables` screenshots stayed aligned on:
  - outer shell size
  - header chrome
  - window controls
  - body extent
- The worktree standalone `GlobalVariables` route preserved the same full-bleed header/body structure while removing the inner grid.
- The worktree floating project chat window preserved the shared header/body shape after moving to `windowFlow`.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionChrome.test.ts src/components/Section/Container/SectionWindowSurface.test.tsx src/components/ChatWindowing/ProjectChatWindowSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.test.tsx`
  - result: `4` files passed, `35` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "section pop-out opens above existing floating windows by default|standalone section routes stay bound to their section thread and keep workspace project chat isolated|workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: `4 passed`
- Chrome DevTools reads:
  - untouched `main` floating and standalone `GlobalVariables`
  - worktree floating and standalone `GlobalVariables`
  - worktree floating project chat window

## Interpretation

- This is a kept higher-seam baseline.
- The shared window surfaces no longer pay the `section-grid-*` inner-shell contract in the worktree.
- The remaining live `sectionChrome` grid seam is now the canvas path and any untouched shared consumers above it.
- The next pass should stay above this split and target the canvas-side surface contract instead of reopening the accepted window surfaces.
