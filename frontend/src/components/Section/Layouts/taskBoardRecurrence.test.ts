import {
  createTaskBoardTask,
  TaskBoardTaskRecurrenceEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  formatTaskRecurrenceSummary,
  getEffectiveRecurrenceDays,
  getEffectiveRecurrenceMonths,
  parseRecurrenceYears,
} from "./taskBoardRecurrence";

describe("taskBoardRecurrence", () => {
  it("formats recurrence summaries from generated weekday and month metadata", () => {
    expect(
      formatTaskRecurrenceSummary(
        createTaskBoardTask({
          recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
          recurrenceDays: ["friday", "monday", "wednesday"],
        }),
      ),
    ).toBe("Mon, Wed, Fri");

    expect(
      formatTaskRecurrenceSummary(
        createTaskBoardTask({
          recurrence: TaskBoardTaskRecurrenceEnum.specified_months,
          recurrenceMonths: ["december", "january", "june"],
        }),
      ),
    ).toBe("Jan, Jun, Dec");
  });

  it("falls back to the Go-owned recurrence label when no selections exist", () => {
    expect(
      formatTaskRecurrenceSummary(
        createTaskBoardTask({
          recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
        }),
      ),
    ).toBe("Repeat specified days");

    expect(
      formatTaskRecurrenceSummary(
        createTaskBoardTask({
          recurrence: TaskBoardTaskRecurrenceEnum.specified_years,
        }),
      ),
    ).toBe("Repeat specified years");
  });

  it("normalizes recurrence selections by authoritative option order", () => {
    expect(
      getEffectiveRecurrenceDays(
        createTaskBoardTask({
          recurrenceDays: ["sunday", "monday", "friday"],
        }),
      ),
    ).toEqual(["monday", "friday", "sunday"]);

    expect(
      getEffectiveRecurrenceMonths(
        createTaskBoardTask({
          recurrenceMonths: ["december", "march", "january"],
        }),
      ),
    ).toEqual(["january", "march", "december"]);
  });

  it("parses, deduplicates, and sorts recurrence years", () => {
    expect(parseRecurrenceYears("2026, 2024, foo, 2026, 0, -1, 2025")).toEqual([
      2024, 2025, 2026,
    ]);
  });
});
