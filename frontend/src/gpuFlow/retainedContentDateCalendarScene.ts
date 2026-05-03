import { createGpuRetainedContentActiveDateCalendarLayout } from "./retainedContentDateCalendarPopupLayout";
import type {
  GpuRetainedContentActivePopupInput,
  GpuRetainedContentDrawCommand,
  GpuRetainedContentHitRecord,
  GpuRetainedContentRow,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

export function createGpuRetainedContentDateCalendarDrawCommands({
  activePopup,
  controlRect,
  rows,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRect: (row: GpuRetainedContentRow) => GpuRect;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentDrawCommand[] {
  const popup = createGpuRetainedContentActiveDateCalendarLayout({
    activePopup,
    controlRect,
    rows,
    viewportRect,
  });
  if (!popup) {
    return [];
  }
  return [
    {
      kind: "control-popup-background",
      rect: popup.backgroundRect,
      rowId: popup.row.id,
    },
    {
      kind: "control-popup-date-calendar-header",
      monthTitle: popup.monthTitle,
      rect: popup.headerRect,
      rowId: popup.row.id,
    },
    ...popup.weekdays.map(
      (weekday): GpuRetainedContentDrawCommand => ({
        kind: "control-popup-date-calendar-weekday",
        rect: weekday.rect,
        rowId: popup.row.id,
        text: weekday.label,
      }),
    ),
    ...popup.cells.map(
      (cell): GpuRetainedContentDrawCommand => ({
        cell: cell.cell,
        cellIndex: cell.cellIndex,
        kind: "control-popup-date-calendar-cell",
        rect: cell.rect,
        rowId: popup.row.id,
      }),
    ),
    {
      kind: "control-popup-date-calendar-summary",
      rect: popup.summaryRect,
      rowId: popup.row.id,
      text: popup.summaryText,
    },
  ];
}

export function createGpuRetainedContentDateCalendarHitRecords({
  activePopup,
  controlRect,
  rows,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRect: (row: GpuRetainedContentRow) => GpuRect;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentHitRecord[] {
  const popup = createGpuRetainedContentActiveDateCalendarLayout({
    activePopup,
    controlRect,
    rows,
    viewportRect,
  });
  if (!popup) {
    return [];
  }
  return popup.cells.map((cell) => ({
    cellIndex: cell.cellIndex,
    cellIsoDate: cell.cell.isoDate,
    id: `popup-date-cell:${popup.row.id}:${cell.cell.isoDate}`,
    kind: "popup-date-cell",
    ownerRowId: popup.row.id,
    rect: cell.rect,
  }));
}
