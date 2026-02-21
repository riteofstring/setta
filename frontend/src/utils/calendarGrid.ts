import {
  DateCalendarWeekStart,
  DateCalendarWeekStartEnum,
} from "utils/generatedTypes";

type CalendarMonthCell = {
  isoDate: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
};

type CalendarMonthAnchor = {
  year: number;
  monthIndex: number;
};

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function isValidDateParts(
  year: number,
  monthIndex: number,
  day: number,
): boolean {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day
  );
}

export function parseIsoDate(
  value: string,
): (CalendarMonthAnchor & { day: number }) | null {
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
  const shiftedTotalMonths = anchor.year * 12 + anchor.monthIndex + deltaMonths;
  const shiftedYear = Math.floor(shiftedTotalMonths / 12);
  const shiftedMonthIndex = ((shiftedTotalMonths % 12) + 12) % 12;
  return {
    year: shiftedYear,
    monthIndex: shiftedMonthIndex,
  };
}

function getWeekOffset(
  firstWeekday: number,
  weekStartsOn: DateCalendarWeekStart,
): number {
  if (weekStartsOn === DateCalendarWeekStartEnum.monday) {
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
  weekStartsOn: DateCalendarWeekStart;
}): CalendarMonthCell[] {
  const firstOfMonthUtcMs = Date.UTC(year, monthIndex, 1);
  const firstOfMonth = new Date(firstOfMonthUtcMs);
  const offset = getWeekOffset(firstOfMonth.getUTCDay(), weekStartsOn);
  const startUtcMs = firstOfMonthUtcMs - offset * MS_PER_DAY;
  const reusableDate = new Date(startUtcMs);
  const grid: CalendarMonthCell[] = new Array(42);

  for (let index = 0; index < 42; index += 1) {
    reusableDate.setTime(startUtcMs + index * MS_PER_DAY);
    const cellYear = reusableDate.getUTCFullYear();
    const cellMonthIndex = reusableDate.getUTCMonth();
    const cellDay = reusableDate.getUTCDate();
    grid[index] = {
      isoDate: formatIsoDate(cellYear, cellMonthIndex, cellDay),
      dayOfMonth: cellDay,
      inCurrentMonth: cellMonthIndex === monthIndex,
    };
  }
  return grid;
}
