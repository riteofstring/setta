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

## Git Graph Overlay Widths

- Stored in local state (`useLocalStorage`) as:
  - `gitGraphSplitPct` (history/diff pane split).
  - `gitGraphColWidthPx` (graph column width).
  - `gitGraphAuthorWidthPx` (author column width).
  - `gitGraphDateWidthPx` (date column width).
  - `gitGraphHashWidthPx` (hash column width).
- Default values are defined in `frontend/src/utils/gitGraphLayoutDefaults.ts`:
  - split: `56`
  - graph: `120px`
  - author: `120px`
  - date: `110px`
  - hash: `84px`
- Applied through CSS variables on the overlay root:
  - `--git-graph-split-pct`
  - `--git-graph-col-graph`
  - `--git-graph-col-author`
  - `--git-graph-col-date`
  - `--git-graph-col-hash`
- The pane splitter and each column boundary clamp width changes to min/max
  bounds to prevent overlap and preserve a minimum message column width.
- Double-clicking a graph-column boundary resets that boundary to its default.

## Persistence

- Param column updates are sent through `route_set_section_column_width`.
- Browser column updates are sent through `route_set_browser_column_widths`.
- Both flows use optimistic updates via `dispatchOptimisticProjectStateUpdate`.
