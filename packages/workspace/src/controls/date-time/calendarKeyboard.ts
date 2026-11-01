import type { WorkspaceTextDirection } from "../../styles/textDirection.js";
import { formatIsoDate, parseIsoDate } from "./calendarGrid.js";
import type { DateCalendarWeekStart } from "./dateTimeTypes.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_NAVIGATION_DELTAS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

function requireIsoDate(isoDate: string) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    throw new Error(
      `Calendar keyboard navigation received an invalid ISO date: ${isoDate}.`,
    );
  }
  return parsed;
}

function shiftCalendarDateByDays(isoDate: string, deltaDays: number): string {
  const parsed = requireIsoDate(isoDate);
  const shifted = new Date(
    Date.UTC(parsed.year, parsed.monthIndex, parsed.day) +
      deltaDays * MS_PER_DAY,
  );
  return formatIsoDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
}

export function shiftCalendarDateByMonths(
  isoDate: string,
  deltaMonths: number,
): string {
  const parsed = requireIsoDate(isoDate);
  const shiftedMonth = new Date(
    Date.UTC(parsed.year, parsed.monthIndex + deltaMonths, 1),
  );
  const year = shiftedMonth.getUTCFullYear();
  const monthIndex = shiftedMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return formatIsoDate(year, monthIndex, Math.min(parsed.day, lastDay));
}

function getWeekdayOffset(
  isoDate: string,
  weekStartsOn: DateCalendarWeekStart,
): number {
  const parsed = requireIsoDate(isoDate);
  const weekday = new Date(
    Date.UTC(parsed.year, parsed.monthIndex, parsed.day),
  ).getUTCDay();
  return weekStartsOn === "monday" ? (weekday + 6) % 7 : weekday;
}

function resolveDayNavigation(
  isoDate: string,
  key: string,
  weekStartsOn: DateCalendarWeekStart,
  direction: WorkspaceTextDirection,
): string | null {
  let deltaDays = DAY_NAVIGATION_DELTAS[key];
  const isHorizontalArrow = key === "ArrowLeft" || key === "ArrowRight";
  if (deltaDays !== undefined && direction === "rtl" && isHorizontalArrow) {
    deltaDays *= -1;
  }
  if (deltaDays !== undefined) {
    return shiftCalendarDateByDays(isoDate, deltaDays);
  }
  if (key === "Home") {
    return shiftCalendarDateByDays(
      isoDate,
      -getWeekdayOffset(isoDate, weekStartsOn),
    );
  }
  if (key === "End") {
    return shiftCalendarDateByDays(
      isoDate,
      6 - getWeekdayOffset(isoDate, weekStartsOn),
    );
  }
  return null;
}

export function resolveCalendarKeyboardDate({
  isoDate,
  key,
  shiftKey,
  weekStartsOn,
  direction,
}: {
  isoDate: string;
  key: string;
  shiftKey: boolean;
  weekStartsOn: DateCalendarWeekStart;
  direction: WorkspaceTextDirection;
}): string | null {
  const dayNavigation = resolveDayNavigation(
    isoDate,
    key,
    weekStartsOn,
    direction,
  );
  if (dayNavigation !== null) {
    return dayNavigation;
  }
  if (key === "PageUp") {
    return shiftCalendarDateByMonths(isoDate, shiftKey ? -12 : -1);
  }
  if (key === "PageDown") {
    return shiftCalendarDateByMonths(isoDate, shiftKey ? 12 : 1);
  }
  return null;
}
