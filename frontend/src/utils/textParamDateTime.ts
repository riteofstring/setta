import {
  DateDisplayFormat,
  DateDisplayFormatEnum,
  TimeDisplayFormat,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_LOCAL_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})[T\s]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const US_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const EURO_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_12H_REGEX = /^(\d{1,2}):([0-5]\d)\s*([AaPp][Mm])$/;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function getLocalTodayIsoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeDateParts(
  year: number,
  month: number,
  day: number,
): string | null {
  if (!isValidDateParts(year, month, day)) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function normalizeTimeTo24Hour(raw: string): string {
  const value = raw.trim();
  const match24 = TIME_24H_REGEX.exec(value);
  if (match24) {
    return `${match24[1]}:${match24[2]}`;
  }
  const match12 = TIME_12H_REGEX.exec(value);
  if (!match12) {
    return "";
  }
  const hourRaw = Number(match12[1]);
  const minute = Number(match12[2]);
  if (hourRaw < 1 || hourRaw > 12) {
    return "";
  }
  const isPm = match12[3].toLowerCase() === "pm";
  let hour = hourRaw % 12;
  if (isPm) {
    hour += 12;
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

function normalizeDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string | null {
  if (!isValidDateParts(year, month, day)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

export function normalizeDateTimeToLocalIso(raw: string): string {
  const value = raw.trim();
  const localMatch = ISO_DATE_TIME_LOCAL_REGEX.exec(value);
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4]);
    const minute = Number(localMatch[5]);
    return normalizeDateTimeParts(year, month, day, hour, minute) ?? "";
  }

  const fromDate = new Date(value);
  if (Number.isNaN(fromDate.getTime())) {
    return "";
  }
  return (
    normalizeDateTimeParts(
      fromDate.getFullYear(),
      fromDate.getMonth() + 1,
      fromDate.getDate(),
      fromDate.getHours(),
      fromDate.getMinutes(),
    ) ?? ""
  );
}

export function splitIsoDateAndTimeParts(raw: string): {
  dateIso: string;
  time24: string;
} | null {
  const normalized = normalizeDateTimeToLocalIso(raw);
  if (normalized === "") {
    return null;
  }
  const [dateIso, time24] = normalized.split("T");
  if (!dateIso || !time24) {
    return null;
  }
  return { dateIso, time24 };
}

export function combineIsoDateAndTimeParts(
  dateIso: string,
  timeRaw: string,
): string {
  const normalizedDate = normalizeDateToIso(dateIso, DateDisplayFormatEnum.iso);
  if (normalizedDate === "") {
    return "";
  }
  const normalizedTime = normalizeTimeTo24Hour(timeRaw);
  if (normalizedTime === "") {
    return "";
  }
  return `${normalizedDate}T${normalizedTime}`;
}

export function formatTimeForDisplay(
  raw: string,
  displayFormat: TimeDisplayFormat,
): string {
  const normalized = normalizeTimeTo24Hour(raw);
  if (normalized === "") {
    return raw.trim();
  }
  if (displayFormat === TimeDisplayFormatEnum.twenty_four_hour) {
    return normalized;
  }
  const [hourText, minuteText] = normalized.split(":");
  const hour24 = Number(hourText);
  const hour12 = hour24 % 12 || 12;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${minuteText} ${suffix}`;
}

function normalizeUsDate(raw: string): string {
  const match = US_DATE_REGEX.exec(raw.trim());
  if (!match) {
    return "";
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  return normalizeDateParts(year, month, day) ?? "";
}

function normalizeEuDate(raw: string): string {
  const match = EURO_DATE_REGEX.exec(raw.trim());
  if (!match) {
    return "";
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return normalizeDateParts(year, month, day) ?? "";
}

export function normalizeDateToIso(
  raw: string,
  displayFormat: DateDisplayFormat,
): string {
  const value = raw.trim();
  const isoMatch = ISO_DATE_REGEX.exec(value);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return normalizeDateParts(year, month, day) ?? "";
  }

  const hinted = (() => {
    if (displayFormat === DateDisplayFormatEnum.us) {
      return normalizeUsDate(value);
    }
    if (displayFormat === DateDisplayFormatEnum.eu) {
      return normalizeEuDate(value);
    }
    return "";
  })();
  if (hinted !== "") {
    return hinted;
  }

  const fromUs = normalizeUsDate(value);
  if (fromUs !== "") {
    return fromUs;
  }
  const fromEu = normalizeEuDate(value);
  if (fromEu !== "") {
    return fromEu;
  }

  if (displayFormat === DateDisplayFormatEnum.long) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return (
        normalizeDateParts(
          parsed.getFullYear(),
          parsed.getMonth() + 1,
          parsed.getDate(),
        ) ?? ""
      );
    }
  }
  return "";
}

export function formatDateForDisplay(
  raw: string,
  displayFormat: DateDisplayFormat,
): string {
  const normalized = normalizeDateToIso(raw, displayFormat);
  if (normalized === "") {
    return raw.trim();
  }
  const [, yearText, monthText, dayText] =
    normalized.match(ISO_DATE_REGEX) ?? [];
  if (!yearText || !monthText || !dayText) {
    return raw.trim();
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (displayFormat === DateDisplayFormatEnum.iso) {
    return normalized;
  }
  if (displayFormat === DateDisplayFormatEnum.us) {
    return `${pad2(month)}/${pad2(day)}/${year}`;
  }
  if (displayFormat === DateDisplayFormatEnum.eu) {
    return `${pad2(day)}/${pad2(month)}/${year}`;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTimeForDisplay(args: {
  raw: string;
  dateDisplayFormat: DateDisplayFormat;
  timeDisplayFormat: TimeDisplayFormat;
}): string {
  const split = splitIsoDateAndTimeParts(args.raw);
  if (!split) {
    return args.raw.trim();
  }
  const dateText = formatDateForDisplay(split.dateIso, args.dateDisplayFormat);
  const timeText = formatTimeForDisplay(split.time24, args.timeDisplayFormat);
  return `${dateText} ${timeText}`.trim();
}
