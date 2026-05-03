import type { GpuRetainedContentDateCalendarCell } from "./retainedContentDateCalendarTypes";
import type {
  GpuRetainedContentActivePopupInput,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRow,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentDateCalendarControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "date-time" }
> & {
  readonly calendar: NonNullable<
    Extract<
      GpuRetainedContentControlDescriptor,
      { kind: "date-time" }
    >["calendar"]
  >;
};

type GpuRetainedContentDateCalendarRow = GpuRetainedContentRow & {
  readonly control: GpuRetainedContentDateCalendarControl;
};

type GpuRetainedContentActiveDateCalendarLayout = {
  readonly backgroundRect: GpuRect;
  readonly cells: readonly {
    readonly cell: GpuRetainedContentDateCalendarCell;
    readonly cellIndex: number;
    readonly highlighted: boolean;
    readonly rect: GpuRect;
  }[];
  readonly headerRect: GpuRect;
  readonly monthTitle: string;
  readonly navigation: readonly {
    readonly direction: -1 | 1;
    readonly rect: GpuRect;
  }[];
  readonly row: GpuRetainedContentDateCalendarRow;
  readonly summaryRect: GpuRect;
  readonly summaryText: string;
  readonly weekdays: readonly {
    readonly label: string;
    readonly rect: GpuRect;
  }[];
};

const DATE_CALENDAR_CELL_COUNT = 42;
const DATE_CALENDAR_COLUMN_COUNT = 7;
const DATE_CALENDAR_MARGIN = 4;
const DATE_CALENDAR_PADDING = 8;
const DATE_CALENDAR_HEADER_HEIGHT = 26;
const DATE_CALENDAR_NAVIGATION_WIDTH = 36;
const DATE_CALENDAR_WEEKDAY_HEIGHT = 18;
const DATE_CALENDAR_CELL_HEIGHT = 22;
const DATE_CALENDAR_SUMMARY_HEIGHT = 18;

export function createGpuRetainedContentActiveDateCalendarLayout({
  activePopup,
  controlRect,
  rows,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRect: (row: GpuRetainedContentRow) => GpuRect;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentActiveDateCalendarLayout | null {
  const row = getGpuRetainedContentActiveDateCalendarRow(activePopup, rows);
  if (!row) {
    return null;
  }
  const backgroundRect = createGpuRetainedContentDateCalendarBackgroundRect({
    controlRect: controlRect(row),
    viewportRect,
  });
  if (backgroundRect.width <= 0 || backgroundRect.height <= 0) {
    return null;
  }
  const innerWidth = Math.max(
    0,
    backgroundRect.width - DATE_CALENDAR_PADDING * 2,
  );
  const highlightedDateIso = activePopup?.highlightedDateIso;
  const headerRect = {
    height: DATE_CALENDAR_HEADER_HEIGHT,
    width: innerWidth,
    x: backgroundRect.x + DATE_CALENDAR_PADDING,
    y: backgroundRect.y + DATE_CALENDAR_PADDING,
  };
  const weekdayY = headerRect.y + headerRect.height;
  const cellY = weekdayY + DATE_CALENDAR_WEEKDAY_HEIGHT;
  const cellWidth = innerWidth / DATE_CALENDAR_COLUMN_COUNT;
  const summaryRect = {
    height: DATE_CALENDAR_SUMMARY_HEIGHT,
    width: innerWidth,
    x: backgroundRect.x + DATE_CALENDAR_PADDING,
    y:
      cellY +
      (DATE_CALENDAR_CELL_COUNT / DATE_CALENDAR_COLUMN_COUNT) *
        DATE_CALENDAR_CELL_HEIGHT,
  };

  return {
    backgroundRect,
    cells: row.control.calendar.cells
      .slice(0, DATE_CALENDAR_CELL_COUNT)
      .map((cell, cellIndex) => ({
        cell,
        cellIndex,
        highlighted: cell.isoDate === highlightedDateIso,
        rect: {
          height: DATE_CALENDAR_CELL_HEIGHT,
          width: cellWidth,
          x:
            backgroundRect.x +
            DATE_CALENDAR_PADDING +
            (cellIndex % DATE_CALENDAR_COLUMN_COUNT) * cellWidth,
          y:
            cellY +
            Math.floor(cellIndex / DATE_CALENDAR_COLUMN_COUNT) *
              DATE_CALENDAR_CELL_HEIGHT,
        },
      })),
    headerRect,
    monthTitle: row.control.calendar.monthTitle,
    navigation: [
      {
        direction: -1,
        rect: {
          height: headerRect.height,
          width: DATE_CALENDAR_NAVIGATION_WIDTH,
          x: headerRect.x,
          y: headerRect.y,
        },
      },
      {
        direction: 1,
        rect: {
          height: headerRect.height,
          width: DATE_CALENDAR_NAVIGATION_WIDTH,
          x: headerRect.x + headerRect.width - DATE_CALENDAR_NAVIGATION_WIDTH,
          y: headerRect.y,
        },
      },
    ],
    row,
    summaryRect,
    summaryText: row.control.calendar.summaryText,
    weekdays: row.control.calendar.weekdayLabels
      .slice(0, DATE_CALENDAR_COLUMN_COUNT)
      .map((label, index) => ({
        label,
        rect: {
          height: DATE_CALENDAR_WEEKDAY_HEIGHT,
          width: cellWidth,
          x: backgroundRect.x + DATE_CALENDAR_PADDING + index * cellWidth,
          y: weekdayY,
        },
      })),
  };
}

function getGpuRetainedContentActiveDateCalendarRow(
  activePopup: GpuRetainedContentActivePopupInput | null | undefined,
  rows: readonly GpuRetainedContentRow[],
): GpuRetainedContentDateCalendarRow | null {
  if (!activePopup || activePopup.kind !== "date-calendar") {
    return null;
  }
  const row = rows.find((candidate) => candidate.id === activePopup.ownerRowId);
  if (
    !row?.control ||
    row.control.kind !== "date-time" ||
    row.control.mode !== "date-calendar" ||
    !row.control.calendar
  ) {
    return null;
  }
  return row as GpuRetainedContentDateCalendarRow;
}

function createGpuRetainedContentDateCalendarBackgroundRect({
  controlRect,
  viewportRect,
}: {
  readonly controlRect: GpuRect;
  readonly viewportRect: GpuRect;
}): GpuRect {
  const width = Math.max(
    0,
    Math.min(
      Math.max(controlRect.width, 224),
      viewportRect.width - DATE_CALENDAR_MARGIN * 2,
    ),
  );
  const height =
    DATE_CALENDAR_PADDING * 2 +
    DATE_CALENDAR_HEADER_HEIGHT +
    DATE_CALENDAR_WEEKDAY_HEIGHT +
    (DATE_CALENDAR_CELL_COUNT / DATE_CALENDAR_COLUMN_COUNT) *
      DATE_CALENDAR_CELL_HEIGHT +
    DATE_CALENDAR_SUMMARY_HEIGHT;
  return {
    height,
    width,
    x: getGpuRetainedContentDateCalendarX({
      controlRect,
      viewportRect,
      width,
    }),
    y: getGpuRetainedContentDateCalendarY({
      controlRect,
      height,
      viewportRect,
    }),
  };
}

function getGpuRetainedContentDateCalendarX({
  controlRect,
  viewportRect,
  width,
}: {
  readonly controlRect: GpuRect;
  readonly viewportRect: GpuRect;
  readonly width: number;
}): number {
  return clampNumber(
    controlRect.x + controlRect.width - width,
    viewportRect.x + DATE_CALENDAR_MARGIN,
    viewportRect.x + viewportRect.width - width - DATE_CALENDAR_MARGIN,
  );
}

function getGpuRetainedContentDateCalendarY({
  controlRect,
  height,
  viewportRect,
}: {
  readonly controlRect: GpuRect;
  readonly height: number;
  readonly viewportRect: GpuRect;
}): number {
  const belowY = controlRect.y + controlRect.height + DATE_CALENDAR_MARGIN;
  const aboveY = controlRect.y - height - DATE_CALENDAR_MARGIN;
  const viewportBottom = viewportRect.y + viewportRect.height;
  if (belowY + height > viewportBottom && aboveY >= viewportRect.y) {
    return aboveY;
  }
  return clampNumber(
    belowY,
    viewportRect.y + DATE_CALENDAR_MARGIN,
    viewportBottom - height - DATE_CALENDAR_MARGIN,
  );
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
