# Column Width Persistence Plan (Param Sections)

## Goal
Persist parameter column widths without sacrificing drag performance. Avoid global `useSectionColumnWidth` store while keeping drag updates off the React render path.

## Current Pain
- `columnWidth` exists in `BaseSectionWithParamsImpl`, but the frontend keeps widths in `useSectionColumnWidth` only.
- Width changes are not persisted to the backend, so they are lost on reload and out of sync with project state.

## Proposed Direction (Local Ref + CSS Variable + Commit on Mouseup)

### Key Ideas
- Use a CSS variable on the section root to drive the layout of all param rows.
- Update the CSS variable directly during drag (no React state updates).
- Persist once per resize interaction (mouse up, or small debounce).
- Sync from backend updates by reading the effective `columnWidth` from project state.

### Implementation Outline

1. **Create a local hook for param column width**
   - New hook (e.g., `useParamColumnWidth`) colocated with params UI or in `frontend/src/state/hooks/`.
   - Holds a `widthRef` + `requestAnimationFrame` loop similar to the existing `useColumnResizer` logic.
   - Updates `outerRef.current.style.setProperty("--param-column-width", `${width}px`)`.
   - Calculates bounds using existing `CENTER_OFFSET`, container width, and `maxNestedDepth`.

2. **Move drag logic from global store to local hook**
   - Replace `useSectionColumnWidth` usage in `frontend/src/state/actions/sectionColumnWidth.ts` and `frontend/src/components/Params/GroupContainer.tsx`.
   - Use `mousemove`/`mouseup` listeners to update the CSS variable.
   - Keep drag-time work in refs only; avoid React state updates.

3. **Make param layout read the CSS variable**
   - Update `frontend/src/components/Params/ParamContainer.tsx` to use
     `gridTemplateColumns` with `var(--param-column-width, <fallback>)`.
   - Remove the `useSectionColumnWidth.subscribe` calls and replace with static inline styles
     or CSS class rules referencing the variable.

4. **Persist on mouseup (backend + project state)**
   - Add a backend request + route:
     - `SetSectionColumnWidthRequest` in `backend/setta/project_state/project_manager_types.py`.
     - `route_set_section_column_width` in `backend/setta/routers/project_manager.py`.
     - `set_section_column_width` in `backend/setta/types/helpers_lvl2.py` using
       `BaseSectionWithParamsImplArgsWithCallable(columnWidth=value)`.
   - Frontend action:
     - Use `dispatchOptimisticProjectStateUpdate` to update `useProjectState` on mouseup.
     - Call `route_set_section_column_width` so the backend persists it.

5. **Sync UI with backend updates**
   - In the local hook, read `columnWidth` from `useProjectState` (effective impl) on mount
     and when project state changes.
   - Apply it to the CSS variable so undo/redo or websocket updates stay in sync.

6. **Remove the global store wiring**
   - Delete `useSectionColumnWidth` from `frontend/src/state/definitions.ts`.
   - Remove `useSectionColumnWidth` initialization in `frontend/src/state/actions/project/loadProject.ts`.
   - Delete or repurpose `frontend/src/state/actions/sectionColumnWidth.ts`.

7. **Browser Area resizer**
   - `frontend/src/state/hooks/useResizableColumns.ts` currently uses the global store too.
   - Option A: keep it local only (UI-only column), no persistence.
   - Option B: reuse the same CSS-variable approach (local ref + DOM updates).

## Notes on Performance
- Drag updates stay off React by using refs + DOM style updates.
- CSS variable propagates to all param rows without prop drilling or re-rendering.
- Project state only updates once per drag interaction, minimizing global churn.

## Follow-ups / Questions
- Preferred debounce or immediate commit on mouseup?
- Should `BrowserArea` width be persisted or remain UI-local only?

