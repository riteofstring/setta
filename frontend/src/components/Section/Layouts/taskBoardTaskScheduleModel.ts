import {
  TaskBoardRecurringMonthEnum,
  TaskBoardRecurringWeekdayEnum,
  TaskBoardTaskRecurrenceEnum,
  type TaskBoardRecurringMonth,
  type TaskBoardRecurringWeekday,
  type TaskBoardTask,
  type TaskBoardTaskRecurrence,
} from "utils/generatedTypes";
import {
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";

export type TaskDueMode = "date" | "date_time";

export const TASK_RECURRENCE_OPTIONS: Array<{
  value: TaskBoardTaskRecurrence;
  label: string;
}> = [
  { value: TaskBoardTaskRecurrenceEnum.none, label: "No repeat" },
  { value: TaskBoardTaskRecurrenceEnum.hourly, label: "Hourly" },
  { value: TaskBoardTaskRecurrenceEnum.daily, label: "Daily" },
  {
    value: TaskBoardTaskRecurrenceEnum.specified_days,
    label: "Repeat specified days",
  },
  {
    value: TaskBoardTaskRecurrenceEnum.specified_months,
    label: "Repeat specified months",
  },
  {
    value: TaskBoardTaskRecurrenceEnum.specified_years,
    label: "Repeat specified years",
  },
];

export const WEEKDAY_OPTIONS: Array<{
  value: TaskBoardRecurringWeekday;
  label: string;
}> = [
  { value: TaskBoardRecurringWeekdayEnum.monday, label: "Mon" },
  { value: TaskBoardRecurringWeekdayEnum.tuesday, label: "Tue" },
  { value: TaskBoardRecurringWeekdayEnum.wednesday, label: "Wed" },
  { value: TaskBoardRecurringWeekdayEnum.thursday, label: "Thu" },
  { value: TaskBoardRecurringWeekdayEnum.friday, label: "Fri" },
  { value: TaskBoardRecurringWeekdayEnum.saturday, label: "Sat" },
  { value: TaskBoardRecurringWeekdayEnum.sunday, label: "Sun" },
];

export const MONTH_OPTIONS: Array<{
  value: TaskBoardRecurringMonth;
  label: string;
}> = [
  { value: TaskBoardRecurringMonthEnum.january, label: "Jan" },
  { value: TaskBoardRecurringMonthEnum.february, label: "Feb" },
  { value: TaskBoardRecurringMonthEnum.march, label: "Mar" },
  { value: TaskBoardRecurringMonthEnum.april, label: "Apr" },
  { value: TaskBoardRecurringMonthEnum.may, label: "May" },
  { value: TaskBoardRecurringMonthEnum.june, label: "Jun" },
  { value: TaskBoardRecurringMonthEnum.july, label: "Jul" },
  { value: TaskBoardRecurringMonthEnum.august, label: "Aug" },
  { value: TaskBoardRecurringMonthEnum.september, label: "Sep" },
  { value: TaskBoardRecurringMonthEnum.october, label: "Oct" },
  { value: TaskBoardRecurringMonthEnum.november, label: "Nov" },
  { value: TaskBoardRecurringMonthEnum.december, label: "Dec" },
];

export function getTaskDueMode(dueDateIso: string): TaskDueMode {
  if (dueDateIso.includes("T")) {
    return "date_time";
  }
  return "date";
}

export function resolveTaskDateValue(dueDateIso: string): string {
  const split = splitIsoDateAndTimeParts(dueDateIso);
  if (split) {
    return split.dateIso;
  }
  return normalizeDateToIso(dueDateIso, "iso");
}

export function resolveTaskDateTimeValue(dueDateIso: string): string {
  const normalized = normalizeDateTimeToLocalIso(dueDateIso);
  if (normalized !== "") {
    return normalized;
  }
  const normalizedDate = normalizeDateToIso(dueDateIso, "iso");
  if (normalizedDate === "") {
    return "";
  }
  return `${normalizedDate}T09:00`;
}

export function sortEnumValuesByOptionOrder<T extends string>(
  values: T[],
  orderedValues: T[],
): T[] {
  const order = new Map(orderedValues.map((value, index) => [value, index]));
  return [...values].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

export function getEffectiveRecurrenceDays(
  task: TaskBoardTask,
): TaskBoardRecurringWeekday[] {
  return sortEnumValuesByOptionOrder(
    task.recurrenceDays,
    WEEKDAY_OPTIONS.map((option) => option.value),
  );
}

export function getEffectiveRecurrenceMonths(
  task: TaskBoardTask,
): TaskBoardRecurringMonth[] {
  return sortEnumValuesByOptionOrder(
    task.recurrenceMonths,
    MONTH_OPTIONS.map((option) => option.value),
  );
}

export function getEffectiveRecurrenceYears(task: TaskBoardTask): number[] {
  if (task.recurrenceYears.length === 0) {
    return [];
  }
  return [...new Set(task.recurrenceYears)].sort((left, right) => left - right);
}

export function areNumberArraysEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function formatTaskDueSummary(dueDateIso: string): string | null {
  if (dueDateIso.trim() === "") {
    return null;
  }
  if (getTaskDueMode(dueDateIso) === "date_time") {
    const value = resolveTaskDateTimeValue(dueDateIso);
    if (value === "") {
      return null;
    }
    return value.replace("T", " ");
  }
  const value = resolveTaskDateValue(dueDateIso);
  return value === "" ? null : value;
}

export function formatTaskDueCardSummary(dueDateIso: string): string | null {
  if (dueDateIso.trim() === "") {
    return null;
  }
  if (getTaskDueMode(dueDateIso) === "date_time") {
    const value = resolveTaskDateTimeValue(dueDateIso);
    if (value === "") {
      return null;
    }
    return `Due: ${value.replace("T", " ")}`;
  }
  const value = resolveTaskDateValue(dueDateIso);
  if (value === "") {
    return null;
  }
  return `Due: ${value}`;
}

export function formatTaskRecurrenceSummary(
  task: TaskBoardTask,
): string | null {
  switch (task.recurrence) {
    case TaskBoardTaskRecurrenceEnum.none:
      return null;
    case TaskBoardTaskRecurrenceEnum.hourly:
      return "Hourly";
    case TaskBoardTaskRecurrenceEnum.daily:
      return "Daily";
    case TaskBoardTaskRecurrenceEnum.specified_days: {
      const days = getEffectiveRecurrenceDays(task);
      if (days.length === 0) {
        return "Repeat specified days";
      }
      return days
        .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day))
        .filter((option): option is (typeof WEEKDAY_OPTIONS)[number] =>
          Boolean(option),
        )
        .map((option) => option.label)
        .join(", ");
    }
    case TaskBoardTaskRecurrenceEnum.specified_months: {
      const months = getEffectiveRecurrenceMonths(task);
      if (months.length === 0) {
        return "Repeat specified months";
      }
      return months
        .map((month) => MONTH_OPTIONS.find((option) => option.value === month))
        .filter((option): option is (typeof MONTH_OPTIONS)[number] =>
          Boolean(option),
        )
        .map((option) => option.label)
        .join(", ");
    }
    case TaskBoardTaskRecurrenceEnum.specified_years: {
      const years = getEffectiveRecurrenceYears(task);
      if (years.length === 0) {
        return "Repeat specified years";
      }
      return years.join(", ");
    }
  }
}

export function formatTaskRecurrenceCardSummary(
  task: TaskBoardTask,
): string | null {
  const summary = formatTaskRecurrenceSummary(task);
  if (summary === null) {
    return null;
  }
  return `Repeat: ${summary}`;
}

export function parseRecurrenceYears(raw: string): number[] {
  if (raw.trim() === "") {
    return [];
  }
  const parsed = raw
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((token) => Number.isInteger(token) && token > 0);
  return [...new Set(parsed)].sort((left, right) => left - right);
}
