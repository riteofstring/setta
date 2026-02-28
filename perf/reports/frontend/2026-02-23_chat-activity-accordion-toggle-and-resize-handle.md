# Chat Activity Accordion Toggle + Resize Handle Hover

Date: 2026-02-23
Area: frontend
Code paths touched:
- `frontend/src/components/Chat/ChatMessages.tsx`
- `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`
- `frontend/src/components/Chat/ChatMessages.test.tsx`

## Scope
- Make structured-output resize handles visible only when hovering/focusing the pane they resize.
- Reduce perceived hitching when opening/closing activity accordion content by removing slide animations on activity accordion content paths.

## Scenario
- Page: `http://127.0.0.1:3096/sleeping_ocean`
- Data: existing project chat history with large activity sections already present on the page.
- Interaction measured: repeatedly toggle one visible `[data-chat-assistant-activity-trigger="true"]` 10 times.
- Browser: Chrome via `chrome-devtools-mcp`, no CPU/network throttling.

## Before (baseline)
- Measurement method:
  - DevTools Performance trace (`performance_start_trace` / `performance_stop_trace`) around scripted toggle loop.
  - In-page timing via `performance.now()` around 10 toggle clicks.
- Key metrics:
  - Toggle loop elapsed: **879.10ms** total for 10 toggles (**87.91ms/toggle**).
  - Trace insight summary (same run): `CLS: 3.25`.
- Observations:
  - Accordion open/close interaction felt choppy with animated open/close classes on activity content containers.

## After
- Same scenario + measurement method.
- Key metrics:
  - Toggle loop elapsed: **617.90ms** total for 10 toggles (**61.79ms/toggle**).
  - Improvement: **-261.20ms total** (~**29.7% faster** for the measured toggle loop).
  - Trace insight summary (same run): `CLS: 0.10`; `ForcedReflow` insight still present in this broad page-level trace.
- Observations:
  - Activity accordion open/close no longer uses slide animations in activity content paths.
  - Resize handles are visually unobtrusive until pane hover/focus while still usable for drag interactions.

## Automated Perf/Regression Guardrails
- Playwright:
  - `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`
  - Added assertions that activity content classes do not include `animate-slide*` and that resize handles are hidden before pane hover and visible on hover.
- Vitest:
  - `frontend/src/components/Chat/ChatMessages.test.tsx`
  - Updated class assertions to guard the non-animated hidden/block accordion content behavior.
