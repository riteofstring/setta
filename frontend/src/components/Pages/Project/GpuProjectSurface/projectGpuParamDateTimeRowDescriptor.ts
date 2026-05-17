import type {
  GpuRetainedContentDateCalendarDescriptor,
  GpuRetainedContentDateCalendarMonth,
} from "gpuFlow/retainedContentDateCalendarTypes";
import type { GpuRetainedContentControlDescriptor } from "gpuFlow/retainedContentScene";
import {
  buildCalendarMonthGrid,
  resolveCalendarAnchorDate,
} from "utils/calendarGrid";
import {
  parseCalendarSelectedDates,
  resolveCalendarSummaryText,
} from "utils/calendarSelection";
import {
  CodeObjTypeEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  TextParamUIConfig,
  TimeControlModeEnum,
  TimeDisplayFormatEnum,
  type DateParamCodeObjImpl,
  type DateSelectionMode,
  type TimeParamCodeObjImpl,
} from "utils/generatedTypes";
import {
  formatDateForDisplay,
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  getLocalTodayIsoDate,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";
import { toProjectGpuParamDisplayValue } from "./projectGpuParamDisplayValue";
import { validateProjectGpuDateCalendarVisibleMonth } from "./projectGpuRetainedParamDateCalendarMonth";

export function createProjectGpuDateTimeControlDescriptorIfSupported({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
}): GpuRetainedContentControlDescriptor | null {
  if (
    codeObjImpl.type !== CodeObjTypeEnum.DateParam &&
    codeObjImpl.type !== CodeObjTypeEnum.TimeParam
  ) {
    return null;
  }
  return createProjectGpuDateTimeControlDescriptor({
    codeObjImpl: codeObjImpl as DateParamCodeObjImpl | TimeParamCodeObjImpl,
    controlKind,
    dateCalendarVisibleMonth,
  });
}

function createProjectGpuDateTimeControlDescriptor({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
}: {
  readonly codeObjImpl: DateParamCodeObjImpl | TimeParamCodeObjImpl;
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
}): GpuRetainedContentControlDescriptor {
  if (codeObjImpl.type === CodeObjTypeEnum.DateParam) {
    return createProjectGpuDateControlDescriptor({
      codeObjImpl: codeObjImpl as DateParamCodeObjImpl,
      controlKind,
      dateCalendarVisibleMonth,
    });
  }
  return createProjectGpuTimeControlDescriptor({
    codeObjImpl: codeObjImpl as TimeParamCodeObjImpl,
    controlKind,
  });
}

function createProjectGpuDateControlDescriptor({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
}: {
  readonly codeObjImpl: DateParamCodeObjImpl;
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
}): GpuRetainedContentControlDescriptor {
  const displayValue = getProjectGpuDateControlDisplayValue(codeObjImpl);
  const mode = getProjectGpuDateControlMode(codeObjImpl);
  return {
    calendar:
      mode === "date-calendar"
        ? createProjectGpuDateCalendarDescriptor(
            codeObjImpl,
            dateCalendarVisibleMonth,
          )
        : null,
    defaultDisplayValue: getProjectGpuDateControlDisplayValue({
      ...codeObjImpl,
      value: codeObjImpl.defaultVal,
    }),
    displayValue,
    kind: "date-time",
    label: getProjectGpuDateControlLabel(codeObjImpl),
    mode,
    renderOwner: mode === "date-calendar" ? "canvas-owned" : "dom-owned",
    rendererFamily: controlKind,
    summaryText: getProjectGpuDateControlSummaryText(codeObjImpl),
    commitPolicy: mode === "date-calendar" ? "immediate" : "native-island",
  };
}

function createProjectGpuTimeControlDescriptor({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: TimeParamCodeObjImpl;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor {
  return {
    calendar: null,
    defaultDisplayValue: getProjectGpuTimeControlDisplayValue({
      ...codeObjImpl,
      value: codeObjImpl.defaultVal,
    }),
    displayValue: getProjectGpuTimeControlDisplayValue(codeObjImpl),
    kind: "date-time",
    label:
      codeObjImpl.timeControlMode === TimeControlModeEnum.display
        ? "Display time"
        : "Time input",
    mode:
      codeObjImpl.timeControlMode === TimeControlModeEnum.display
        ? "time-display"
        : "time-input",
    renderOwner: "dom-owned",
    rendererFamily: controlKind,
    summaryText: null,
    commitPolicy: "native-island",
  };
}

function getProjectGpuDateControlDisplayValue(
  codeObjImpl: DateParamCodeObjImpl,
): string {
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  if (codeObjImpl.dateIncludesTime) {
    return formatDateTimeForDisplay({
      raw: value,
      dateDisplayFormat: codeObjImpl.dateDisplayFormat,
      timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
    });
  }
  return formatDateForDisplay(value, codeObjImpl.dateDisplayFormat);
}

function getProjectGpuTimeControlDisplayValue(
  codeObjImpl: TimeParamCodeObjImpl,
): string {
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const formatted = formatTimeForDisplay(value, codeObjImpl.timeDisplayFormat);
  return formatted.trim().length > 0 ? formatted : "--:--";
}

function getProjectGpuDateControlMode(
  codeObjImpl: DateParamCodeObjImpl,
): "date-calendar" | "date-input" | "date-time-input" {
  if (codeObjImpl.dateControlMode === DateControlModeEnum.calendar) {
    return "date-calendar";
  }
  return codeObjImpl.dateIncludesTime ? "date-time-input" : "date-input";
}

function getProjectGpuDateControlLabel(
  codeObjImpl: DateParamCodeObjImpl,
): string {
  if (codeObjImpl.dateControlMode === DateControlModeEnum.calendar) {
    return codeObjImpl.dateIncludesTime ? "Calendar + time" : "Calendar";
  }
  return codeObjImpl.dateIncludesTime ? "Date + time input" : "Date input";
}

function getProjectGpuDateControlSummaryText(
  codeObjImpl: DateParamCodeObjImpl,
): string | null {
  if (codeObjImpl.dateControlMode !== DateControlModeEnum.calendar) {
    return null;
  }
  const selectionMode = codeObjImpl.dateIncludesTime
    ? DateSelectionModeEnum.single
    : codeObjImpl.dateSelectionMode;
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const selectedDates = parseCalendarSelectedDates(
    value,
    selectionMode,
    codeObjImpl.dateIncludesTime,
  );
  return resolveCalendarSummaryText({
    selectedDates,
    value,
    selectionMode,
    includeTime: codeObjImpl.dateIncludesTime,
    splitDateTime: splitIsoDateAndTimeParts(value),
    dateDisplayFormat: codeObjImpl.dateDisplayFormat,
    timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
  });
}

function createProjectGpuDateCalendarDescriptor(
  codeObjImpl: DateParamCodeObjImpl,
  visibleMonth: GpuRetainedContentDateCalendarMonth | null,
): GpuRetainedContentDateCalendarDescriptor {
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const selectionMode = getProjectGpuDateCalendarSelectionMode(codeObjImpl);
  const splitDateTime = splitIsoDateAndTimeParts(value);
  const selectedDates = parseCalendarSelectedDates(
    value,
    selectionMode,
    codeObjImpl.dateIncludesTime,
  );
  const anchor =
    visibleMonth ?? resolveCalendarAnchorDate(selectedDates[0] ?? "");
  validateProjectGpuDateCalendarVisibleMonth(anchor);
  const selectedDateSet = new Set(selectedDates);
  const todayIso = getLocalTodayIsoDate();
  const summaryText = resolveCalendarSummaryText({
    selectedDates,
    value,
    selectionMode,
    includeTime: codeObjImpl.dateIncludesTime,
    splitDateTime,
    dateDisplayFormat: codeObjImpl.dateDisplayFormat,
    timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
  });
  return {
    cells: buildCalendarMonthGrid({
      year: anchor.year,
      monthIndex: anchor.monthIndex,
      weekStartsOn: codeObjImpl.dateCalendarWeekStart,
    }).map((cell) => ({
      dayOfMonth: cell.dayOfMonth,
      inCurrentMonth: cell.inCurrentMonth,
      isoDate: cell.isoDate,
      selected: selectedDateSet.has(cell.isoDate),
      today: cell.isoDate === todayIso,
    })),
    includeTime: codeObjImpl.dateIncludesTime,
    month: {
      monthIndex: anchor.monthIndex,
      year: anchor.year,
    },
    monthTitle: formatProjectGpuDateCalendarMonthTitle(
      anchor.year,
      anchor.monthIndex,
    ),
    selectedDates,
    selectedTimeValue: splitDateTime?.time24 ?? "00:00",
    selectionMode,
    summaryText,
    weekdayLabels: getProjectGpuDateCalendarWeekdayLabels(
      codeObjImpl.dateCalendarWeekStart,
    ),
  };
}

function getProjectGpuDateCalendarSelectionMode(
  codeObjImpl: DateParamCodeObjImpl,
): DateSelectionMode {
  return codeObjImpl.dateIncludesTime
    ? DateSelectionModeEnum.single
    : codeObjImpl.dateSelectionMode;
}

function getProjectGpuDateCalendarWeekdayLabels(
  weekStart: DateParamCodeObjImpl["dateCalendarWeekStart"],
): readonly string[] {
  const labels = TextParamUIConfig.calendarWeekdayLabelsByWeekStart[weekStart];
  if (!labels) {
    throw new Error(`Missing GPU retained weekday labels for ${weekStart}.`);
  }
  return labels;
}

function formatProjectGpuDateCalendarMonthTitle(
  year: number,
  monthIndex: number,
): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}
