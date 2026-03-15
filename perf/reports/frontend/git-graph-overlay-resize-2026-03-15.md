# Git Graph Overlay Resize Ownership

Date: `2026-03-15`
Slice: `GitGraphOverlay` pane-split and column-resize ownership extraction

## Context

- CDP verification used the same-origin app shell on `http://127.0.0.1:3002`.
- The live app opened the Git overview and graph overlay directly, then seeded
  the stored split and column widths to `56 / 120 / 120 / 110 / 84` before each
  scripted resize pass.
- Existing automation already covered the full interaction contract through
  `frontend/tests/e2e/git/git-graph-overlay-resize.spec.ts`; the CDP pass was
  used for geometry confirmation and trace notes around the refactor.

## Before

- Pre-refactor Playwright resize coverage passed against the disposable git
  fixture.
- A scripted CDP trace over pane and column drags reported `historyWidth: 504`
  and `diffWidth: 360` at the end of the baseline pass, with no horizontal list
  overflow.
- The same trace reported `CLS: 0.02`, but that signal is not treated as a
  regression gate here because the scripted pointer events are synthetic and can
  show up as layout shifts even though the interaction is intentional.

## After

- Post-refactor Playwright resize coverage still passed against the same
  disposable git fixture.
- At `1440x900`, a fresh CDP drag pass finished with `historyWidth: 779.36`,
  `diffWidth: 564.64`, `messageAuthorOverlap: -8`, `overflowDelta: 0`, and
  `innerOverflowX: hidden`.
- At `1024x720`, a far-left pane drag still clamped cleanly with
  `historyWidth: 482`, `diffWidth: 446`, `overlapDelta: -8`,
  `overflowDelta: 0`, and `innerOverflowX: hidden`.
- The post-refactor scripted trace reported `CLS: 0.21`, but the same caveat
  applies: synthetic pointer events are not a stable way to judge resize
  interaction performance in DevTools, so the deterministic geometry checks and
  Playwright coverage remained the pass/fail signal for this slice.

## Result

- Extracting `gitGraphOverlayResizeModel.ts` and `useGitGraphOverlayResize.ts`
  moved pane split and column-resize lifecycle ownership out of
  `GitGraphOverlay.tsx` without changing the resize clamps, double-click reset
  behavior, or overflow contract.
- The overlay still kept the commit headers separated, the history or diff pane
  minimum widths intact, and the virtualized list free of horizontal overflow at
  both larger and narrower viewport checks.
