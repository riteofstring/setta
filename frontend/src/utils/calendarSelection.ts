import { parseIsoDate } from "utils/calendarGrid";
import {
  DateDisplayFormat,
  DateDisplayFormatEnum,
  DateSelectionMode,
  DateSelectionModeEnum,
  TimeDisplayFormat,
} from "utils/generatedTypes";
import {
  combineIsoDateAndTimeParts,
  formatDateTimeForDisplay,
  normalizeDateToIso,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";

function collectCalendarSelectionCandidates(parsed: unknown): Array<string> {
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === "string");
  }
  if (typeof parsed === "string") {
    return [parsed];
  }
  return [];
}

function parseCalendarSelectionCandidates(rawValue: string): Array<string> {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return [];
  }
  try {
    return collectCalendarSelectionCandidates(JSON.parse(trimmed));
  } catch {
    return [trimmed];
  }
}

function normalizeCalendarSelectionCandidate(
  candidate: string,
  includeTime: boolean,
): string {
  const dateCandidate = includeTime
    ? splitIsoDateAndTimeParts(candidate)?.dateIso ?? candidate
    : candidate;
  return normalizeDateToIso(dateCandidate, DateDisplayFormatEnum.iso);
}

export function parseCalendarSelectedDates(
  rawValue: string,
  selectionMode: DateSelectionMode,
  includeTime = false,
): Array<string> {
  if (selectionMode === DateSelectionModeEnum.single) {
    const candidate = includeTime
      ? splitIsoDateAndTimeParts(rawValue)?.dateIso ?? ""
      : rawValue;
    const normalized = normalizeDateToIso(candidate, DateDisplayFormatEnum.iso);
    if (parseIsoDate(normalized) === null) {
      return [];
    }
    return [normalized];
  }
  const normalized = parseCalendarSelectionCandidates(rawValue)
    .map((candidate) =>
      normalizeCalendarSelectionCandidate(candidate, includeTime),
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
  if (selectionMode === DateSelectionModeEnum.single) {
    return sorted[0] ?? "";
  }
  if (sorted.length === 0) {
    return "";
  }
  return JSON.stringify(sorted);
}

export function resolveCalendarSummaryText({
  selectedDates,
  value,
  selectionMode,
  includeTime,
  splitDateTime,
  dateDisplayFormat,
  timeDisplayFormat,
}: {
  selectedDates: Array<string>;
  value: string;
  selectionMode: DateSelectionMode;
  includeTime: boolean;
  splitDateTime: ReturnType<typeof splitIsoDateAndTimeParts>;
  dateDisplayFormat: DateDisplayFormat;
  timeDisplayFormat: TimeDisplayFormat;
}): string {
  if (selectionMode === DateSelectionModeEnum.multiple) {
    return `${selectedDates.length} selected`;
  }
  if (includeTime && splitDateTime) {
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
  if (selectionMode === DateSelectionModeEnum.multiple) {
    const nextDates = isSelected
      ? selectedDates.filter((date) => date !== cellIsoDate)
      : [...selectedDates, cellIsoDate];
    return serializeCalendarSelectedDates(nextDates, selectionMode);
  }
  if (includeTime) {
    return combineIsoDateAndTimeParts(cellIsoDate, selectedTimeValue);
  }
  return serializeCalendarSelectedDates([cellIsoDate], selectionMode);
}
