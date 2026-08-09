# 2026-03-12 Chat Runtime Follow-up: Accordion Lag And Standalone Chat Parity

Date: 2026-03-12
Worktree: `misc-fixes`
Dev instance: `http://127.0.0.1:3026`

## Scope

Follow-up runtime/chat polish after the original UI polish plan:

- nested activity accordion lag
- minimized thought preview bottom-completion behavior
- standalone `/chat` frame parity
- light-mode activity/tool row surfaces

## Baseline

Route: `/branch_showing`
Theme: dark
Interaction:

1. Open an assistant activity accordion in the floating chat window.
2. Toggle a nested activity row inside it.
3. Close the parent accordion again.

Baseline DevTools trace summary:

- `INP`: `839 ms`
- Forced reflow insight: present

Notable forced-reflow frames surfaced in the trace:

- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` around line `537`
- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` around line `2419`
- Radix accordion internals near `@radix-ui/react-accordion`

Observed cause:

- Nested accordion toggles were still paying for extra layout work during animated open/close transitions.
- Pointerdown on an already-topmost chat window was also churning focus/z-index state unnecessarily, which amplified rerender/layout work during interactions inside the same window.

## Changes

- Removed remaining chat activity accordion slide animations and switched those content regions to simple open/closed display toggles.
- Made topmost chat-window focus a no-op so clicking inside the already-focused window stops churning z-index/last-focused state.
- Changed minimized thought preview scrolling from fixed-speed drift to bounded-duration interpolation so longer overflows still finish on the actual bottom.
- Reused the shared `ProjectChatWindowSurface` frame for standalone `/chat` to align dark/light visuals with the regular full-window chat shell.

## After

Route: `/branch_showing`
Theme: dark
Interaction: same toggle path as baseline

After DevTools trace summary:

- `INP`: `129 ms`
- `CLS`: `0.00`
- Forced reflow insight: not surfaced in the top-level trace summary for this interaction

## Result

The accordion path moved from visibly laggy to acceptable in the live trace for the same interaction class, with INP dropping from `839 ms` to `129 ms`.

The standalone `/chat` route also now visually reuses the same shared frame shell as the regular full-window chat in both dark and light mode, which removes the previous styling drift between the two surfaces.
