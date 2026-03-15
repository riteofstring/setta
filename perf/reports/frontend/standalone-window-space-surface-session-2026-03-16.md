# Standalone Window Space Surface Session Extraction

Date: 2026-03-16

## Scope

- `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx`
  now acts as the standalone window-space coordinator for viewport observation
  and final render composition.
- `frontend/src/components/Pages/Project/standaloneWindowSpaceWindowModel.ts`
  now owns standalone window hydration, merge, focus, bounds, chat-id, and
  embedded-git visibility transitions.
- `frontend/src/components/Pages/Project/useStandaloneWindowSpaceWindowSession.ts`
  now owns local window-session state, blocked managed-window filtering,
  visible-window sorting, and snap-resize interaction state.

## Measurements

- File-size shift:
  - `StandaloneWindowSpaceSurface.tsx`: `985 -> 333` lines
  - `standaloneWindowSpaceWindowModel.ts`: `348` lines
  - `useStandaloneWindowSpaceWindowSession.ts`: `393` lines
- Live before metrics were unavailable. The active dev page did not have a
  saved standalone window-space route before the refactor, so CDP verification
  used a client-only injected `windowSpaces["codex-standalone-space"]`
  fixture after the extraction.
- After extraction, CDP measurements on
  `http://127.0.0.1:3002/wave_tiger/windowspace/codex-standalone-space`:
  - `1440x900`: surface `1440x772`, subtree `475` nodes, `2` windows, `0`
    resize handles, no horizontal overflow
  - `960x900`: surface `960x772`, subtree `478` nodes, `2` windows, `1`
    resize handle, no horizontal overflow

## Result

- The standalone page-shell root shrank materially while the injected
  standalone route remained visually stable at both desktop widths.
- The window-state ownership path is now sharper for both agents and humans:
  pure window hydration/update transitions live in the standalone window model,
  while interaction/session state lives in the local session hook instead of
  being mixed into the page surface.
