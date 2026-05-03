import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentDateTimeMode =
  | "date-calendar"
  | "date-input"
  | "date-time-input"
  | "time-display"
  | "time-input";

type GpuRetainedContentDateSelectionMode = "multiple" | "single";

export type GpuRetainedContentDateCalendarCell = {
  readonly dayOfMonth: number;
  readonly inCurrentMonth: boolean;
  readonly isoDate: string;
  readonly selected: boolean;
  readonly today: boolean;
};

export type GpuRetainedContentDateCalendarMonth = {
  readonly monthIndex: number;
  readonly year: number;
};

export type GpuRetainedContentDateCalendarDescriptor = {
  readonly cells: readonly GpuRetainedContentDateCalendarCell[];
  readonly includeTime: boolean;
  readonly month: GpuRetainedContentDateCalendarMonth;
  readonly monthTitle: string;
  readonly selectedDates: readonly string[];
  readonly selectedTimeValue: string;
  readonly selectionMode: GpuRetainedContentDateSelectionMode;
  readonly summaryText: string;
  readonly weekdayLabels: readonly string[];
};

export type GpuRetainedContentDateCalendarDrawCommand =
  | {
      readonly cell: GpuRetainedContentDateCalendarCell;
      readonly cellIndex: number;
      readonly highlighted: boolean;
      readonly kind: "control-popup-date-calendar-cell";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly kind: "control-popup-date-calendar-header";
      readonly monthTitle: string;
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly direction: -1 | 1;
      readonly kind: "control-popup-date-calendar-navigation";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly kind: "control-popup-date-calendar-summary";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly text: string;
    }
  | {
      readonly kind: "control-popup-date-calendar-weekday";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly text: string;
    };
