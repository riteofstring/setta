import {
  TaskBoardRecurringMonthEnum,
  TaskBoardRecurringWeekdayEnum,
  TaskBoardTaskRecurrenceEnum,
  createTaskBoardTask,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  formatTaskDueCardSummary,
  formatTaskDueSummary,
  formatTaskRecurrenceCardSummary,
  formatTaskRecurrenceSummary,
  parseRecurrenceYears,
} from "./taskBoardTaskScheduleModel";

describe("taskBoardTaskScheduleModel", () => {
  it("formats due and weekday recurrence summaries in stable display order", () => {
    // Keep the schedule summary owner aligned with both list and kanban task surfaces.
    const task = createTaskBoardTask({
      dueDateIso: "2026-03-01T09:15",
      recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
      recurrenceDays: [
        TaskBoardRecurringWeekdayEnum.wednesday,
        TaskBoardRecurringWeekdayEnum.monday,
      ],
    });

    expect(formatTaskDueSummary(task.dueDateIso)).toBe("2026-03-01 09:15");
    expect(formatTaskDueCardSummary(task.dueDateIso)).toBe(
      "Due: 2026-03-01 09:15",
    );
    expect(formatTaskRecurrenceSummary(task)).toBe("Mon, Wed");
    expect(formatTaskRecurrenceCardSummary(task)).toBe("Repeat: Mon, Wed");
  });

  it("normalizes month and year recurrence summaries without preserving duplicates", () => {
    // The extracted model should stay deterministic regardless of backend ordering noise.
    const monthTask = createTaskBoardTask({
      recurrence: TaskBoardTaskRecurrenceEnum.specified_months,
      recurrenceMonths: [
        TaskBoardRecurringMonthEnum.october,
        TaskBoardRecurringMonthEnum.march,
      ],
    });
    const yearTask = createTaskBoardTask({
      recurrence: TaskBoardTaskRecurrenceEnum.specified_years,
      recurrenceYears: [2028, 2026, 2028],
    });

    expect(formatTaskRecurrenceSummary(monthTask)).toBe("Mar, Oct");
    expect(formatTaskRecurrenceSummary(yearTask)).toBe("2026, 2028");
    expect(parseRecurrenceYears(" 2028, 2026, nope, 2028 ")).toEqual([
      2026, 2028,
    ]);
  });
});
