# Column Widths

This document explains how column width sizing is calculated, persisted, and applied in the UI.

## Shared Mechanics

- Drag/resize logic lives in `frontend/src/state/hooks/useColumnWidthDrag.ts`.
- A shared width ref tracks the current width, container width, percentage, and drag state.
- A `ResizeObserver` keeps the same percentage width when the container resizes.
- Double-click resets to the default width (50% of the container) and persists it.
- Column width updates are applied via CSS variables, so updates do not require React re-renders.

## Defaults And Bounds

- Default raw width is `containerWidth / 2` in `frontend/src/state/hooks/columnWidthUtils.ts`.
- Base bounds use `calculateBoundedWidth`, which keeps a margin based on nested depth.
- Param columns additionally enforce a minimum remaining value column width via
  `calculateBoundedWidthWithMinRemainingWidth`.

## Param Column Widths

- Stored on the backend in `BaseSectionWithParamsImpl.columnWidth` (px).
- Applied to the UI with the CSS variable `--param-column-width`, which is read in
  `frontend/src/components/Params/ParamContainer.tsx`.
- The resize handle sits in the center gutter, so the stored width excludes the gutter
  offset. `useParamColumnWidth` subtracts `CENTER_OFFSET` when persisting and adds it
  back when reading.
- The param value column is kept from shrinking too far via
  `MIN_PARAM_VALUE_COLUMN_WIDTH` in `frontend/src/state/hooks/useParamColumnWidth.ts`.

## Browser Column Widths

- Stored on the backend in `BrowserSectionImpl.columnWidth` and
  `BrowserSectionImpl.typesColumnWidth`.
- Applied via the CSS variables `--browser-column-width` and
  `--browser-types-column-width` in `frontend/src/components/Section/Layouts/BrowserArea.tsx`.
- Browser widths are raw pixel values, so no offset translation is applied.

## Persistence

- Param column updates are sent through `route_set_section_column_width`.
- Browser column updates are sent through `route_set_browser_column_widths`.
- Both flows use optimistic updates via `dispatchOptimisticProjectStateUpdate`.
