import { parseIsoDate, type CalendarMonthCell } from "./calendarGrid";
import type {
  DateDisplayFormat,
  DateSelectionMode,
  TimeDisplayFormat,
} from "./dateTimeTypes";
import {
  combineIsoDateAndTimeParts,
  formatDateTimeForDisplay,
  normalizeDateToIso,
  splitIsoDateAndTimeParts,
} from "./dateTimeUtils";

function collectCalendarSelectionCandidates(parsed: unknown): Array<string> {
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === "string");
  }
  return typeof parsed === "string" ? [parsed] : [];
}

function parseCalendarSelectionCandidates(rawValue: string): Array<string> {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return [];
  }
  try {
    return collectCalendarSelectionCandidates(JSON.parse(trimmed));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [trimmed];
    }
    throw error;
  }
}

export function parseCalendarSelectedDates(
  rawValue: string,
  selectionMode: DateSelectionMode,
  includeTime: boolean,
): Array<string> {
  if (selectionMode === "single") {
    const candidate = includeTime
      ? (splitIsoDateAndTimeParts(rawValue)?.dateIso ?? "")
      : rawValue;
    const normalized = normalizeDateToIso(candidate, "iso");
    return parseIsoDate(normalized) ? [normalized] : [];
  }
  const normalized = parseCalendarSelectionCandidates(rawValue)
    .map((candidate) =>
      normalizeDateToIso(
        includeTime
          ? (splitIsoDateAndTimeParts(candidate)?.dateIso ?? candidate)
          : candidate,
        "iso",
      ),
    )
    .filter((candidate) => parseIsoDate(candidate) !== null);
  return Array.from(new Set(normalized)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function serializeCalendarSelectedDates(
  selectedDates: Array<string>,
  selectionMode: DateSelectionMode,
): string {
  const sorted = Array.from(new Set(selectedDates)).sort((left, right) =>
    left.localeCompare(right),
  );
  if (selectionMode === "single") {
    return sorted[0] ?? "";
  }
  return sorted.length === 0 ? "" : JSON.stringify(sorted);
}

export function formatMonthTitle(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function resolveCalendarCellClassName(
  cell: CalendarMonthCell,
  selected: boolean,
  today: boolean,
) {
  const monthClass = cell.inCurrentMonth
    ? "text-setta-700 dark:text-setta-200"
    : "text-setta-400 dark:text-setta-500";
  const selectedClass = selected
    ? "bg-blue-500 text-white hover:bg-blue-500/90 dark:bg-blue-600 dark:text-white"
    : "hover:bg-setta-200/40 dark:hover:bg-setta-700/60";
  const todayClass = today ? "ring-1 ring-blue-400 dark:ring-blue-500" : "";
  return `rounded px-1 py-1 text-xs font-medium ${monthClass} ${selectedClass} ${todayClass}`;
}

export function resolveCalendarSummaryText({
  selectedDates,
  value,
  selectionMode,
  includeTime,
  dateDisplayFormat,
  timeDisplayFormat,
}: {
  selectedDates: Array<string>;
  value: string;
  selectionMode: DateSelectionMode;
  includeTime: boolean;
  dateDisplayFormat: DateDisplayFormat;
  timeDisplayFormat: TimeDisplayFormat;
}): string {
  if (selectionMode === "multiple") {
    return `${selectedDates.length} selected`;
  }
  if (includeTime && splitIsoDateAndTimeParts(value)) {
    return formatDateTimeForDisplay({
      raw: value,
      dateDisplayFormat,
      timeDisplayFormat,
    });
  }
  return selectedDates[0] ?? "No date selected";
}

export function resolveCalendarDateSelectionValue({
  cellIsoDate,
  isSelected,
  selectedDates,
  selectionMode,
  includeTime,
  selectedTimeValue,
}: {
  cellIsoDate: string;
  isSelected: boolean;
  selectedDates: Array<string>;
  selectionMode: DateSelectionMode;
  includeTime: boolean;
  selectedTimeValue: string;
}): string {
  if (selectionMode === "multiple") {
    const nextDates = isSelected
      ? selectedDates.filter((date) => date !== cellIsoDate)
      : [...selectedDates, cellIsoDate];
    return serializeCalendarSelectedDates(nextDates, selectionMode);
  }
  return includeTime
    ? combineIsoDateAndTimeParts(cellIsoDate, selectedTimeValue)
    : serializeCalendarSelectedDates([cellIsoDate], selectionMode);
}
