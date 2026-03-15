/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  TaskBoardRecurringWeekdayEnum,
  TaskBoardTaskRecurrenceEnum,
  createTaskBoardTask,
  type TaskBoardTask,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDueInput, TaskRecurrenceInput } from "./taskBoardTaskSchedule";

function renderTextInputChange(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getButtonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

function DueHarness({
  initialTask,
  onDueChange,
}: {
  initialTask: TaskBoardTask;
  onDueChange: (nextDueDateIso: string) => void;
}) {
  const [task, setTask] = useState(initialTask);

  return (
    <TaskDueInput
      task={task}
      isDisabled={false}
      onChange={(nextDueDateIso) => {
        setTask((current) => ({ ...current, dueDateIso: nextDueDateIso }));
        onDueChange(nextDueDateIso);
      }}
    />
  );
}

function RecurrenceHarness({
  initialTask,
  onPatch,
}: {
  initialTask: TaskBoardTask;
  onPatch: (patch: Partial<TaskBoardTask>) => void;
}) {
  const [task, setTask] = useState(initialTask);

  return (
    <TaskRecurrenceInput
      task={task}
      isDisabled={false}
      onChangePatch={(patch) => {
        setTask((current) => ({ ...current, ...patch }));
        onPatch(patch);
      }}
    />
  );
}

describe("taskBoardTaskSchedule", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("switches a date-only due value into date-time mode with the default hour", async () => {
    const onDueChange = vi.fn();

    await act(async () => {
      root.render(
        <DueHarness
          initialTask={createTaskBoardTask({
            id: "task-a",
            dueDateIso: "2026-03-04",
          })}
          onDueChange={onDueChange}
        />,
      );
    });

    const dueMode = host.querySelector(
      '[data-testid="task-board-task-due-mode-task-a"]',
    ) as HTMLSelectElement | null;
    const initialDueValue = host.querySelector(
      '[data-testid="task-board-task-due-value-task-a"]',
    ) as HTMLInputElement | null;
    const initialDueDate = initialDueValue?.value ?? "";

    expect(dueMode?.value).toBe("date");

    await act(async () => {
      if (!dueMode) {
        throw new Error("Missing due mode select.");
      }
      dueMode.value = "date_time";
      dueMode.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const dueValue = host.querySelector(
      '[data-testid="task-board-task-due-value-task-a"]',
    ) as HTMLInputElement | null;

    expect(onDueChange).toHaveBeenLastCalledWith(`${initialDueDate}T09:00`);
    expect(dueValue?.type).toBe("datetime-local");
    expect(dueValue?.value).toBe(`${initialDueDate}T09:00`);
  });

  it("keeps specified-day patches sorted by weekday order instead of click order", async () => {
    const onPatch = vi.fn();

    await act(async () => {
      root.render(
        <RecurrenceHarness
          initialTask={createTaskBoardTask({
            id: "task-b",
            recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
          })}
          onPatch={onPatch}
        />,
      );
    });

    await act(async () => {
      getButtonByText(host, "Wed").click();
    });
    await act(async () => {
      getButtonByText(host, "Mon").click();
    });

    expect(onPatch).toHaveBeenLastCalledWith({
      recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
      recurrenceDays: [
        TaskBoardRecurringWeekdayEnum.monday,
        TaskBoardRecurringWeekdayEnum.wednesday,
      ],
      recurrenceMonths: [],
      recurrenceYears: [],
    });
  });

  it("commits normalized recurrence years on blur", async () => {
    const onPatch = vi.fn();

    await act(async () => {
      root.render(
        <RecurrenceHarness
          initialTask={createTaskBoardTask({
            id: "task-c",
            recurrence: TaskBoardTaskRecurrenceEnum.specified_years,
            recurrenceYears: [2027],
          })}
          onPatch={onPatch}
        />,
      );
    });

    const yearsInput = host.querySelector(
      '[data-testid="task-board-task-recurrence-years-task-c"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      if (!yearsInput) {
        throw new Error("Missing recurrence years input.");
      }
      renderTextInputChange(yearsInput, "2028, 2026, 2028, nope");
      yearsInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      yearsInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    const normalizedInput = host.querySelector(
      '[data-testid="task-board-task-recurrence-years-task-c"]',
    ) as HTMLInputElement | null;

    expect(onPatch).toHaveBeenLastCalledWith({
      recurrence: TaskBoardTaskRecurrenceEnum.specified_years,
      recurrenceYears: [2026, 2028],
      recurrenceDays: [],
      recurrenceMonths: [],
    });
    expect(normalizedInput?.value).toBe("2026, 2028");
  });
});
