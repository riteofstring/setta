import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCallback, useEffect, useState } from "react";
import { FiCalendar } from "react-icons/fi";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import {
  TaskBoardTaskRecurrenceEnum,
  type TaskBoardTask,
  type TaskBoardTaskRecurrence,
} from "utils/generatedTypes";
import {
  combineIsoDateAndTimeParts,
  getLocalTodayIsoDate,
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
} from "utils/textParamDateTime";
import {
  areNumberArraysEqual,
  getEffectiveRecurrenceDays,
  getEffectiveRecurrenceMonths,
  getEffectiveRecurrenceYears,
  getTaskDueMode,
  MONTH_OPTIONS,
  parseRecurrenceYears,
  resolveTaskDateTimeValue,
  resolveTaskDateValue,
  sortEnumValuesByOptionOrder,
  TASK_RECURRENCE_OPTIONS,
  WEEKDAY_OPTIONS,
  type TaskDueMode,
} from "./taskBoardTaskScheduleModel";

const TASK_BOARD_NO_DRAG_CLASS_NAME = "task-board-no-drag";

export function TaskScheduleMenu({
  task,
  isDisabled,
  dueSummary,
  recurrenceSummary,
  onChangePatch,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  dueSummary: string | null;
  recurrenceSummary: string | null;
  onChangePatch: (patch: Partial<TaskBoardTask>) => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-testid={`task-board-task-schedule-menu-${task.id}`}
          aria-label="Task schedule settings"
          className={`nodrag nopan ${TASK_BOARD_NO_DRAG_CLASS_NAME} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800`}
          disabled={isDisabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <FiCalendar size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-testid={`task-board-task-schedule-content-${task.id}`}
          align="end"
          sideOffset={6}
          className={`z-30 flex w-[280px] flex-col gap-2 rounded-md border border-setta-200 bg-white p-2 shadow-xl dark:border-setta-700 dark:bg-setta-900 ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Due
            </p>
            <TaskDueInput
              task={task}
              isDisabled={isDisabled}
              onChange={(nextDueDateIso) =>
                onChangePatch({ dueDateIso: nextDueDateIso })
              }
            />
            {dueSummary !== null ? (
              <p className="truncate text-[10px] text-setta-500 dark:text-setta-400">
                {dueSummary}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Repeat
            </p>
            <TaskRecurrenceInput
              task={task}
              isDisabled={isDisabled}
              onChangePatch={onChangePatch}
            />
            {recurrenceSummary !== null ? (
              <p className="truncate text-[10px] text-setta-500 dark:text-setta-400">
                {recurrenceSummary}
              </p>
            ) : null}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function TaskDueInput({
  task,
  isDisabled,
  onChange,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  onChange: (nextDueDateIso: string) => void;
}) {
  const dueMode = getTaskDueMode(task.dueDateIso);
  const dateValue = resolveTaskDateValue(task.dueDateIso);
  const dateTimeValue = resolveTaskDateTimeValue(task.dueDateIso);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        data-testid={`task-board-task-due-mode-${task.id}`}
        value={dueMode}
        onChange={(event) => {
          const nextMode = event.target.value as TaskDueMode;
          if (nextMode === "date_time") {
            const normalizedDate =
              dateValue !== "" ? dateValue : getLocalTodayIsoDate();
            const combined = combineIsoDateAndTimeParts(
              normalizedDate,
              "09:00",
            );
            onChange(combined);
            return;
          }
          onChange(dateValue);
        }}
        disabled={isDisabled}
        className="w-[88px] shrink-0 rounded border border-setta-200 bg-white px-1 py-1 text-[10px] text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
      >
        <option value="date">Date</option>
        <option value="date_time">Date+Time</option>
      </select>
      <input
        data-testid={`task-board-task-due-value-${task.id}`}
        type={dueMode === "date_time" ? "datetime-local" : "date"}
        value={dueMode === "date_time" ? dateTimeValue : dateValue}
        onChange={(event) => {
          if (dueMode === "date_time") {
            onChange(normalizeDateTimeToLocalIso(event.target.value));
            return;
          }
          onChange(normalizeDateToIso(event.target.value, "iso"));
        }}
        disabled={isDisabled}
        className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
      />
    </div>
  );
}

export function TaskRecurrenceInput({
  task,
  isDisabled,
  onChangePatch,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  onChangePatch: (patch: Partial<TaskBoardTask>) => void;
}) {
  const recurrenceMode = task.recurrence;
  const recurrenceDays = getEffectiveRecurrenceDays(task);
  const recurrenceMonths = getEffectiveRecurrenceMonths(task);
  const recurrenceYears = getEffectiveRecurrenceYears(task);
  const recurrenceYearsText = recurrenceYears.join(", ");
  const [recurrenceYearsDraft, setRecurrenceYearsDraft] =
    useState(recurrenceYearsText);

  useEffect(() => {
    setRecurrenceYearsDraft(recurrenceYearsText);
  }, [recurrenceYearsText]);

  const setRecurrenceMode = (nextMode: TaskBoardTaskRecurrence) => {
    onChangePatch({
      recurrence: nextMode,
      recurrenceDays:
        nextMode === TaskBoardTaskRecurrenceEnum.specified_days
          ? recurrenceDays
          : [],
      recurrenceMonths:
        nextMode === TaskBoardTaskRecurrenceEnum.specified_months
          ? recurrenceMonths
          : [],
      recurrenceYears:
        nextMode === TaskBoardTaskRecurrenceEnum.specified_years
          ? recurrenceYears
          : [],
    });
  };

  const commitRecurrenceYears = useCallback(
    (rawValue: string) => {
      const nextYears = parseRecurrenceYears(rawValue);
      const normalizedDraft = nextYears.join(", ");
      setRecurrenceYearsDraft(normalizedDraft);
      if (areNumberArraysEqual(nextYears, recurrenceYears)) {
        return;
      }
      onChangePatch({
        recurrence: TaskBoardTaskRecurrenceEnum.specified_years,
        recurrenceYears: nextYears,
        recurrenceDays: [],
        recurrenceMonths: [],
      });
    },
    [onChangePatch, recurrenceYears],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <select
        data-testid={`task-board-task-recurrence-mode-${task.id}`}
        value={recurrenceMode}
        onChange={(event) =>
          setRecurrenceMode(event.target.value as TaskBoardTaskRecurrence)
        }
        disabled={isDisabled}
        className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
      >
        {TASK_RECURRENCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_days ? (
        <TaskRecurrenceChipSelector
          testId={`task-board-task-recurrence-days-${task.id}`}
          options={WEEKDAY_OPTIONS}
          values={recurrenceDays}
          disabled={isDisabled}
          onChange={(nextDays) =>
            onChangePatch({
              recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
              recurrenceDays: sortEnumValuesByOptionOrder(
                nextDays,
                WEEKDAY_OPTIONS.map((option) => option.value),
              ),
              recurrenceMonths: [],
              recurrenceYears: [],
            })
          }
        />
      ) : null}

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_months ? (
        <TaskRecurrenceChipSelector
          testId={`task-board-task-recurrence-months-${task.id}`}
          options={MONTH_OPTIONS}
          values={recurrenceMonths}
          disabled={isDisabled}
          onChange={(nextMonths) =>
            onChangePatch({
              recurrence: TaskBoardTaskRecurrenceEnum.specified_months,
              recurrenceMonths: sortEnumValuesByOptionOrder(
                nextMonths,
                MONTH_OPTIONS.map((option) => option.value),
              ),
              recurrenceDays: [],
              recurrenceYears: [],
            })
          }
        />
      ) : null}

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_years ? (
        <input
          type="text"
          data-testid={`task-board-task-recurrence-years-${task.id}`}
          value={recurrenceYearsDraft}
          onChange={(event) => {
            setRecurrenceYearsDraft(event.target.value);
          }}
          onBlur={(event) => {
            commitRecurrenceYears(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            event.currentTarget.blur();
          }}
          disabled={isDisabled}
          placeholder="2026, 2027"
          className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        />
      ) : null}
    </div>
  );
}

function TaskRecurrenceChipSelector<T extends string>({
  testId,
  options,
  values,
  disabled,
  onChange,
}: {
  testId: string;
  options: Array<{ value: T; label: string }>;
  values: T[];
  disabled: boolean;
  onChange: (nextValues: T[]) => void;
}) {
  const selected = new Set(values);
  return (
    <div data-testid={testId} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const isSelected = selected.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            className={`nodrag nopan rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
              isSelected
                ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
                : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            } disabled:opacity-50`}
            onClick={() => {
              if (selected.has(option.value)) {
                onChange(values.filter((value) => value !== option.value));
                return;
              }
              onChange([...values, option.value]);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
