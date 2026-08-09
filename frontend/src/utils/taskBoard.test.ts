import {
  createTaskBoardColumn,
  createTaskBoardTask,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  applyTaskBoardMutation,
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
    const normalized = normalizeTaskBoardState({
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
    const lanes = buildTaskBoardLanes(normalized);

    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.tasks.map((task) => task.id)).toEqual(["a"]);
    expect(lanes[1]?.tasks.map((task) => task.id)).toEqual(["b"]);
  });

  it("requires normalized columns when building lanes", () => {
    expect(() =>
      buildTaskBoardLanes({
        viewMode: TaskBoardViewModeEnum.kanban,
        columns: [],
        tasks: [],
      }),
    ).toThrowError("buildTaskBoardLanes requires normalized columns.");
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

  it("normalizes structural mutations", () => {
    const normalized = normalizeTaskBoardState({
      viewMode: TaskBoardViewModeEnum.task_list,
      columns: [
        createTaskBoardColumn({
          id: "todo",
          name: "Todo",
          sortIndex: 0,
        }),
        createTaskBoardColumn({
          id: "done",
          name: "Done",
          sortIndex: 1,
        }),
      ],
      tasks: [],
    });

    const next = applyTaskBoardMutation({
      state: normalized,
      kind: "structural",
      mutator: (current) => ({
        ...current,
        tasks: [
          createTaskBoardTask({
            id: "second",
            title: "Second",
            sortIndex: 9,
            columnId: "todo",
          }),
          createTaskBoardTask({
            id: "first",
            title: "First",
            sortIndex: 2,
            columnId: "todo",
          }),
        ],
      }),
    });

    expect(next.tasks.map((task) => task.id)).toEqual(["first", "second"]);
    expect(next.tasks.map((task) => task.sortIndex)).toEqual([0, 1]);
  });

  it("preserves ordering for non-structural mutations", () => {
    const normalized = normalizeTaskBoardState({
      viewMode: TaskBoardViewModeEnum.task_list,
      columns: [
        createTaskBoardColumn({
          id: "todo",
          name: "Todo",
          sortIndex: 0,
        }),
      ],
      tasks: [
        createTaskBoardTask({
          id: "first",
          title: "First",
          sortIndex: 0,
          columnId: "todo",
        }),
        createTaskBoardTask({
          id: "second",
          title: "Second",
          sortIndex: 1,
          columnId: "todo",
        }),
      ],
    });

    const next = applyTaskBoardMutation({
      state: normalized,
      kind: "non_structural",
      mutator: (current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === "first" ? { ...task, title: "Renamed" } : task,
        ),
      }),
    });

    expect(next.tasks.map((task) => task.id)).toEqual(["first", "second"]);
    expect(next.tasks.map((task) => task.sortIndex)).toEqual([0, 1]);
    expect(next.tasks[0]?.title).toBe("Renamed");
  });
});
