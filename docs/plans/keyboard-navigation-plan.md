# Keyboard navigation plan

## Goals
- Make every major region (header, left pane, canvas, right pane, modals) reachable and predictable with keyboard only.
- Provide fast pane-to-pane movement and section-level navigation on the canvas.
- Keep tab order stable and reduce the amount of tabbing needed to reach common targets.

## Current signals
- Tab scoping exists in `frontend/src/utils/focusManager.ts` and is registered by Overview, UI Editor, Canvas, and Header.
- Global shortcut dispatch lives in `frontend/src/state/actions/keyActivations.ts`.
- The header/nav is now part of the custom tab loop (header scope added).
- Modals do not opt out of the global Tab handler.
- Canvas focus walks all focusables inside sections, which can be too dense for quick navigation.

## Progress
- Added a header tab scope to include the full navbar in the custom focus loop.
- Removed the standalone SiteLogo scope so header navigation remains a single scope.
- Added pane focus shortcuts: Ctrl+Shift+1/2/3/4 for Header, Overview, Canvas, UI Editor.
- Added `data-tab-native` to modal content so Tab stays inside Radix dialogs.
- Added last-focused element memory per scope so pane jumps return to where you left off.
- Added top-level section navigation shortcuts (Alt+J/K) that jump between sections on the canvas.

## Plan
1. Header scope and inclusion in tab order
   - Done: registered a header scope so the menu/search/dark mode controls are reachable.
   - Implemented in `frontend/src/components/AppHeader/Header.tsx`.
2. Pane cycling shortcuts
   - Add a helper in `frontend/src/utils/focusManager.ts` to focus a scope by id.
   - Done: `focusScope` helper added and Mod+Shift+1/2/3/4 bound in `frontend/src/state/actions/keyActivations.ts`.
3. Remember last focus per scope
   - Done: tracked last focused element per scope and preferred it on scope focus.
   - Implemented in `frontend/src/utils/focusManager.ts`.
4. Section-level navigation on the canvas
   - Add shortcuts for next/previous top-level section and a drill-in action.
   - Use `focusOnSection` and the existing top-level layout ordering in `getCanvasFocusableElements`.
   - Candidate: `frontend/src/utils/focusManager.ts` + bindings in `frontend/src/state/actions/keyActivations.ts`.
   - Done: added top-level section jump shortcuts and shared ordering logic in `frontend/src/utils/focusManager.ts`.
5. Keyboard panning and zooming when canvas is focused
   - Add arrow-key pan (small step) and Shift+Arrow (larger step).
   - Reuse `updateMapPosition` or `d3Zoom.translateBy` from the ReactFlow container.
6. Pane resize/toggle shortcuts
   - Add shortcuts to nudge left/right pane widths and toggle visibility.
   - Reuse `useLocalStorage` width setters + `onOverviewResizeStop` in `frontend/src/components/Panes/paneFns.tsx`.
7. Roving tabindex for vertical tab bars
   - Allow Up/Down/Home/End to move focus within Overview and UI Editor tab stacks.
   - Files: `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/components/Panes/UiEditor/UiEditor.tsx`.
8. Modal focus isolation
   - Done: marked dialog content with `data-tab-native` so global Tab handling does not escape modals.
   - Implemented in `frontend/src/components/Modals/ModalContainer.tsx`.
9. Shortcut discoverability
   - Add a minimal shortcut reference (menu item or help overlay) listing pane cycling, search modes, and section navigation.
   - Consider reusing existing shortcut text from `frontend/src/components/AppHeader/FileMenu.tsx`.

## Validation
- Tab order reaches header, left pane, canvas, right pane, and modals without mouse.
- Pane cycling shortcuts land on expected elements and preserve last focus per scope.
- Section navigation jumps between top-level sections without excessive tabbing.
- Arrow-key pan works only when canvas has focus and does not conflict with text fields.

## Open questions
- Which pane cycling shortcut set should be primary (F6 vs Ctrl+1/2/3/4)?
- Should section-level navigation be global or active only when the canvas has focus?
- Do we need different behavior for share mode vs edit mode?
