import type {
  TaskBoardRecurringMonth,
  TaskBoardRecurringWeekday,
  TaskBoardTask,
  TaskBoardTaskRecurrence,
} from "utils/generatedTypes";
import {
  TaskBoardTaskRecurrenceEnum,
  TaskBoardUIConfig,
} from "utils/generatedTypes";

const TASK_BOARD_RECURRENCE_LABEL_BY_VALUE = new Map<
  TaskBoardTaskRecurrence,
  string
>(
  TaskBoardUIConfig.recurrenceOptions.map((option) => [
    option.value,
    option.label,
  ]),
);

const TASK_BOARD_WEEKDAY_LABEL_BY_VALUE = new Map<
  TaskBoardRecurringWeekday,
  string
>(
  TaskBoardUIConfig.weekdayOptions.map((option) => [
    option.value,
    option.label,
  ]),
);

const TASK_BOARD_MONTH_LABEL_BY_VALUE = new Map<
  TaskBoardRecurringMonth,
  string
>(TaskBoardUIConfig.monthOptions.map((option) => [option.value, option.label]));

const TASK_BOARD_WEEKDAY_ORDER = TaskBoardUIConfig.weekdayOptions.map(
  (option) => option.value,
);

const TASK_BOARD_MONTH_ORDER = TaskBoardUIConfig.monthOptions.map(
  (option) => option.value,
);

function getRecurrenceLabel(
  recurrence: TaskBoardTaskRecurrence,
): string | null {
  return TASK_BOARD_RECURRENCE_LABEL_BY_VALUE.get(recurrence) ?? null;
}

function formatTaskBoardLabeledRecurrenceValues<T extends string>(
  values: readonly T[],
  emptyLabel: string | null,
  labelByValue: ReadonlyMap<T, string>,
): string | null {
  if (values.length === 0) {
    return emptyLabel;
  }
  return values
    .map((value) => labelByValue.get(value))
    .filter((label): label is string => Boolean(label))
    .join(", ");
}

function formatSpecifiedDaySummary(task: TaskBoardTask): string | null {
  return formatTaskBoardLabeledRecurrenceValues(
    getEffectiveRecurrenceDays(task),
    getRecurrenceLabel(task.recurrence),
    TASK_BOARD_WEEKDAY_LABEL_BY_VALUE,
  );
}

function formatSpecifiedMonthSummary(task: TaskBoardTask): string | null {
  return formatTaskBoardLabeledRecurrenceValues(
    getEffectiveRecurrenceMonths(task),
    getRecurrenceLabel(task.recurrence),
    TASK_BOARD_MONTH_LABEL_BY_VALUE,
  );
}

function formatSpecifiedYearSummary(task: TaskBoardTask): string | null {
  const years = getEffectiveRecurrenceYears(task);
  if (years.length === 0) {
    return getRecurrenceLabel(task.recurrence);
  }
  return years.join(", ");
}

const TASK_BOARD_RECURRENCE_SUMMARY_BY_MODE: Record<
  TaskBoardTaskRecurrence,
  (task: TaskBoardTask) => string | null
> = {
  [TaskBoardTaskRecurrenceEnum.none]: () => null,
  [TaskBoardTaskRecurrenceEnum.hourly]: (task) =>
    getRecurrenceLabel(task.recurrence),
  [TaskBoardTaskRecurrenceEnum.daily]: (task) =>
    getRecurrenceLabel(task.recurrence),
  [TaskBoardTaskRecurrenceEnum.specified_days]: formatSpecifiedDaySummary,
  [TaskBoardTaskRecurrenceEnum.specified_months]: formatSpecifiedMonthSummary,
  [TaskBoardTaskRecurrenceEnum.specified_years]: formatSpecifiedYearSummary,
};

function sortEnumValuesByOptionOrder<T extends string>(
  values: readonly T[],
  orderedValues: readonly T[],
): T[] {
  const order = new Map(orderedValues.map((value, index) => [value, index]));
  return [...values].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

export function sortRecurringWeekdays(
  values: readonly TaskBoardRecurringWeekday[],
): TaskBoardRecurringWeekday[] {
  return sortEnumValuesByOptionOrder(values, TASK_BOARD_WEEKDAY_ORDER);
}

export function sortRecurringMonths(
  values: readonly TaskBoardRecurringMonth[],
): TaskBoardRecurringMonth[] {
  return sortEnumValuesByOptionOrder(values, TASK_BOARD_MONTH_ORDER);
}

export function getEffectiveRecurrenceDays(
  task: TaskBoardTask,
): TaskBoardRecurringWeekday[] {
  return sortRecurringWeekdays(task.recurrenceDays);
}

export function getEffectiveRecurrenceMonths(
  task: TaskBoardTask,
): TaskBoardRecurringMonth[] {
  return sortRecurringMonths(task.recurrenceMonths);
}

export function getEffectiveRecurrenceYears(task: TaskBoardTask): number[] {
  if (task.recurrenceYears.length === 0) {
    return [];
  }
  return [...new Set(task.recurrenceYears)].sort((left, right) => left - right);
}

export function areNumberArraysEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
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

export function formatTaskRecurrenceSummary(
  task: TaskBoardTask,
): string | null {
  return TASK_BOARD_RECURRENCE_SUMMARY_BY_MODE[task.recurrence](task);
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
