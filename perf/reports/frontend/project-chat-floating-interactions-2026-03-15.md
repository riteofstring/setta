# Project Chat Floating Interactions

Date: `2026-03-15`
Slice: `ProjectChatBottomDock` floating interaction ownership extraction

## Context

- CDP verification used a same-origin harness on `http://127.0.0.1:3002`.
- The normal app shell was still blank because of the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing), so the harness imported `ProjectChatBottomDock` directly and seeded floating project-chat windows through `useProjectState`.
- The harness patched `setPointerCapture` / `releasePointerCapture` / `hasPointerCapture` on `HTMLElement.prototype` so synthetic pointer events could exercise the floating drag handles, resize handles, and snap-resize handles without relying on the broken full app shell.

## Before

- Dragging a floating window toward the top-left edge still surfaced the `top_left` snap ghost zone in the same-origin harness.
- A free-floating bottom-right resize still expanded a window from `420x320` to `592x452`.
- Four seeded quarter-snapped windows still rendered one vertical plus one horizontal snap-resize handle, and a `60px` vertical drag still resolved the snapped widths to `660/540`.
- Screenshot: `perf/reports/frontend/project-chat-floating-interactions-before-2026-03-15.png`

## After

- Dragging the same floating window toward the top-left edge still surfaced the `top_left` snap ghost zone, with the preview bounds clamped to `left -168`, `top 40`, and `252px` still visible in the viewport.
- A free-floating bottom-right resize still expanded a window from `420x320` to `592x452`.
- Four seeded quarter-snapped windows still rendered one vertical plus one horizontal snap-resize handle, and the same `60px` vertical drag still resolved the snapped widths to `660/540`.
- Screenshot: `perf/reports/frontend/project-chat-floating-interactions-after-2026-03-15.png`

## Result

- Extracting `projectChatFloatingInteractions.ts` preserved the floating interaction contract while moving preview batching, snap-preview state, viewport guardrails, and floating drag/resize or snap-resize pointer sessions out of `ProjectChatBottomDock.tsx`.
- The same-origin harness kept the drag ghost zone, free-floating resize growth, and quarter-snap resize behavior intact after the ownership split.
