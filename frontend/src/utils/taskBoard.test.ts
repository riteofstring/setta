import {
  createTaskBoardColumn,
  createTaskBoardTask,
  TaskBoardTaskRecurrenceEnum,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildTaskBoardLanes,
  getNextColumnSortIndex,
  getNextTaskSortIndex,
  normalizeTaskBoardState,
} from "./taskBoard";

describe("taskBoard utils", () => {
  it("normalizes empty states with a fallback column", () => {
    const normalized = normalizeTaskBoardState({
      viewMode: TaskBoardViewModeEnum.kanban,
      columns: [],
      tasks: [],
    });

    expect(normalized.columns).toHaveLength(1);
    expect(normalized.columns[0]?.name).toBe("Todo");
    expect(normalized.tasks).toEqual([]);
  });

  it("normalizes task column assignments and ordering", () => {
    const todo = createTaskBoardColumn({
      id: "todo",
      name: "Todo",
      sortIndex: 2,
    });
    const doing = createTaskBoardColumn({
      id: "doing",
      name: "Doing",
      sortIndex: 0,
    });
    const tasks = [
      createTaskBoardTask({
        id: "t3",
        title: "third",
        sortIndex: 3,
        columnId: "missing",
      }),
      createTaskBoardTask({
        id: "t1",
        title: "first",
        sortIndex: 1,
        columnId: "doing",
      }),
      createTaskBoardTask({
        id: "t2",
        title: "second",
        sortIndex: 2,
        columnId: "doing",
      }),
    ];

    const normalized = normalizeTaskBoardState({
      viewMode: TaskBoardViewModeEnum.task_list,
      columns: [todo, doing],
      tasks,
    });

    expect(normalized.columns.map((column) => column.id)).toEqual([
      "doing",
      "todo",
    ]);
    expect(normalized.tasks.map((task) => task.id)).toEqual(["t1", "t2", "t3"]);
    expect(normalized.tasks[2]?.columnId).toBe("doing");
  });

  it("builds lanes with grouped tasks", () => {
    const todo = createTaskBoardColumn({
      id: "todo",
      name: "Todo",
      sortIndex: 0,
    });
    const done = createTaskBoardColumn({
      id: "done",
      name: "Done",
      sortIndex: 1,
    });
    const lanes = buildTaskBoardLanes({
      viewMode: TaskBoardViewModeEnum.kanban,
      columns: [todo, done],
      tasks: [
        createTaskBoardTask({
          id: "a",
          title: "A",
          columnId: "todo",
          sortIndex: 0,
        }),
        createTaskBoardTask({
          id: "b",
          title: "B",
          columnId: "done",
          sortIndex: 1,
        }),
      ],
    });

    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.tasks.map((task) => task.id)).toEqual(["a"]);
    expect(lanes[1]?.tasks.map((task) => task.id)).toEqual(["b"]);
  });

  it("normalizes missing recurrence fields from persisted tasks", () => {
    const todo = createTaskBoardColumn({
      id: "todo",
      name: "Todo",
      sortIndex: 0,
    });
    // Some persisted tasks can be missing recurrence fields if saved before
    // the recurrence metadata was introduced.
    // @ts-expect-error intentionally validating runtime normalization behavior
    const persistedTask = {
      id: "legacy-task",
      title: "Legacy",
      description: "",
      completed: false,
      columnId: "todo",
      dueDateIso: "",
      sortIndex: 0,
    };

    const normalized = normalizeTaskBoardState({
      viewMode: TaskBoardViewModeEnum.kanban,
      columns: [todo],
      tasks: [persistedTask],
    });

    expect(normalized.tasks[0]?.recurrence).toBe(
      TaskBoardTaskRecurrenceEnum.none,
    );
    expect(normalized.tasks[0]?.recurrenceDays).toEqual([]);
    expect(normalized.tasks[0]?.recurrenceMonths).toEqual([]);
    expect(normalized.tasks[0]?.recurrenceYears).toEqual([]);
  });

  it("computes next sort indexes", () => {
    expect(getNextTaskSortIndex([])).toBe(0);
    expect(
      getNextTaskSortIndex([
        createTaskBoardTask({ id: "a", sortIndex: 4 }),
        createTaskBoardTask({ id: "b", sortIndex: 9 }),
      ]),
    ).toBe(10);

    expect(getNextColumnSortIndex([])).toBe(0);
    expect(
      getNextColumnSortIndex([
        createTaskBoardColumn({ id: "a", sortIndex: 2 }),
        createTaskBoardColumn({ id: "b", sortIndex: 5 }),
      ]),
    ).toBe(6);
  });
});
