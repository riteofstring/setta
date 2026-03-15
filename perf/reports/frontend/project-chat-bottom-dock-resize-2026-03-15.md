# Project Chat Bottom Dock Resize

Date: `2026-03-15`
Slice: `ProjectChatBottomDock` dock-resize ownership extraction

## Context

- CDP verification used a same-origin harness on `http://127.0.0.1:3002`.
- The normal app shell was still blank because of the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing), so the harness imported `ProjectChatBottomDock` directly and seeded a single bottom-docked project-AI window.
- The harness patched `setPointerCapture` / `releasePointerCapture` / `hasPointerCapture` on `HTMLElement.prototype` so synthetic pointer events could exercise the dock resize handles without relying on the broken full app shell.

## Before

- Initial dock panel size: `460x430`
- Bottom-right drag far toward the top-left clamped to the minimum dock size: `280x220`
- Screenshot: `perf/reports/frontend/project-chat-bottom-dock-resize-before-2026-03-15.png`

## After

- Fresh harness initial dock panel size: `460x430`
- Bottom-right drag far toward the top-left still clamps to the minimum dock size: `280x220`
- Fresh harness larger drag from the default size expands cleanly to `720x610`
- At the larger size, the composer stayed visible with `39px` remaining between the panel bottom and the input bottom edge, and the snapshot still showed the titlebar controls plus message composer without clipping or duplicate scrollbars.
- Screenshot: `perf/reports/frontend/project-chat-bottom-dock-resize-after-2026-03-15.png`

## Result

- Extracting `projectChatDockResize.ts` preserved the dock-resize interaction contract while moving the preview width/height state, stale-preview pruning, and pointer-session bookkeeping out of `ProjectChatBottomDock.tsx`.
- The minimum clamp and larger resize checkpoints remained intact, and the resized surface still rendered the composer and window controls cleanly in the same-origin harness.
