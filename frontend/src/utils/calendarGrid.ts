import { CalendarWeekStart, CalendarWeekStartEnum } from "utils/generatedTypes";

export type CalendarMonthCell = {
  isoDate: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
};

export type CalendarMonthAnchor = {
  year: number;
  monthIndex: number;
};

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function isValidDateParts(year: number, monthIndex: number, day: number): boolean {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day
  );
}

export function parseIsoDate(value: string): CalendarMonthAnchor & { day: number } | null {
  const match = ISO_DATE_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!isValidDateParts(year, monthIndex, day)) {
    return null;
  }
  return { year, monthIndex, day };
}

export function getTodayIsoDate(date: Date = new Date()): string {
  return formatIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

export function resolveCalendarAnchorDate(
  selectedDateIso: string,
  now: Date = new Date(),
): CalendarMonthAnchor {
  const parsed = parseIsoDate(selectedDateIso);
  if (parsed) {
    return {
      year: parsed.year,
      monthIndex: parsed.monthIndex,
    };
  }
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  };
}

export function shiftCalendarMonth(
  anchor: CalendarMonthAnchor,
  deltaMonths: number,
): CalendarMonthAnchor {
  const shifted = new Date(Date.UTC(anchor.year, anchor.monthIndex + deltaMonths, 1));
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
  };
}

function getWeekOffset(
  firstWeekday: number,
  weekStartsOn: CalendarWeekStart,
): number {
  if (weekStartsOn === CalendarWeekStartEnum.monday) {
    return (firstWeekday + 6) % 7;
  }
  return firstWeekday;
}

export function buildCalendarMonthGrid({
  year,
  monthIndex,
  weekStartsOn,
}: {
  year: number;
  monthIndex: number;
  weekStartsOn: CalendarWeekStart;
}): CalendarMonthCell[] {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const offset = getWeekOffset(firstOfMonth.getUTCDay(), weekStartsOn);
  const startDate = new Date(Date.UTC(year, monthIndex, 1 - offset));

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate() + index,
      ),
    );
    return {
      isoDate: formatIsoDate(
        cellDate.getUTCFullYear(),
        cellDate.getUTCMonth(),
        cellDate.getUTCDate(),
      ),
      dayOfMonth: cellDate.getUTCDate(),
      inCurrentMonth: cellDate.getUTCMonth() === monthIndex,
    };
  });
}
