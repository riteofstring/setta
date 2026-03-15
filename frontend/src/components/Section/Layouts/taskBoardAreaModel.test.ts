import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import type { SettaCollision } from "forks/dnd-kit/adapter/types";
import {
  createTaskBoardColumn,
  createTaskBoardTask,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  appendTaskBoardTask,
  findDoneColumnId,
  reorderTaskBoardTasks,
  resolveTaskBoardDropTarget,
  resolveTaskDropTargetFromDelta,
  shouldAutoCompleteColumnTask,
  toColumnDndId,
  toTaskBoardState,
  toTaskDndId,
} from "./taskBoardAreaModel";

function createCollision(id: string, pastHalfway?: boolean): SettaCollision {
  return {
    id,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: 1,
    ...(pastHalfway === undefined ? {} : { pastHalfway }),
  };
}

describe("taskBoardAreaModel", () => {
  it("marks newly added tasks complete when they start in the done column", () => {
    // This keeps add-task ownership responsible for the same done-column heuristic.
    const todoColumn = createTaskBoardColumn({
      id: "todo",
      name: "Todo",
      sortIndex: 0,
    });
    const doneColumn = createTaskBoardColumn({
      id: "done",
      name: "Done",
      sortIndex: 1,
    });

    const next = appendTaskBoardTask(
      toTaskBoardState({
        viewMode: TaskBoardViewModeEnum.kanban,
        columns: [todoColumn, doneColumn],
        tasks: [],
      }),
      {
        title: "   ",
        columnId: doneColumn.id,
      },
    );

    expect(findDoneColumnId(next.columns)).toBe(doneColumn.id);
    expect(shouldAutoCompleteColumnTask(next.columns, doneColumn.id)).toBe(
      true,
    );
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]?.title).toBe("New Task");
    expect(next.tasks[0]?.completed).toBe(true);
    expect(next.tasks[0]?.columnId).toBe(doneColumn.id);
  });

  it("reorders tasks across columns and preserves done-column completion", () => {
    // This guards the extracted move logic that the root now delegates to.
    const todoColumn = createTaskBoardColumn({
      id: "todo",
      name: "Todo",
      sortIndex: 0,
    });
    const doneColumn = createTaskBoardColumn({
      id: "done",
      name: "Done",
      sortIndex: 1,
    });
    const state = toTaskBoardState({
      viewMode: TaskBoardViewModeEnum.kanban,
      columns: [todoColumn, doneColumn],
      tasks: [
        createTaskBoardTask({
          id: "source",
          title: "Source",
          columnId: todoColumn.id,
          completed: false,
          sortIndex: 0,
        }),
        createTaskBoardTask({
          id: "stay",
          title: "Stay",
          columnId: todoColumn.id,
          completed: false,
          sortIndex: 1,
        }),
        createTaskBoardTask({
          id: "done-task",
          title: "Done Task",
          columnId: doneColumn.id,
          completed: true,
          sortIndex: 2,
        }),
      ],
    });

    const next = reorderTaskBoardTasks(state, {
      sourceTaskId: "source",
      targetTaskId: "done-task",
      targetColumnId: doneColumn.id,
      targetPlacement: "after",
    });

    expect(next.tasks.map((task) => task.id)).toEqual([
      "stay",
      "done-task",
      "source",
    ]);
    expect(next.tasks.map((task) => task.sortIndex)).toEqual([0, 1, 2]);
    expect(next.tasks[2]?.columnId).toBe(doneColumn.id);
    expect(next.tasks[2]?.completed).toBe(true);
  });

  it("prefers task collisions over the lane fallback when resolving drop targets", () => {
    // This preserves the first-hop DnD collision owner after moving it out of the root component.
    const tasks = [
      createTaskBoardTask({
        id: "source",
        title: "Source",
        columnId: "todo",
        sortIndex: 0,
      }),
      createTaskBoardTask({
        id: "target",
        title: "Target",
        columnId: "todo",
        sortIndex: 1,
      }),
    ];

    const target = resolveTaskBoardDropTarget({
      sourceTaskId: "source",
      overId: toColumnDndId("todo"),
      overData: {
        taskId: "target",
        columnId: "todo",
      },
      collisions: [
        createCollision(toTaskDndId("target"), true),
        createCollision(toColumnDndId("todo")),
      ],
      tasks,
      fallbackColumnId: "todo",
    });

    expect(target).toEqual({
      targetTaskId: "target",
      targetColumnId: "todo",
      targetPlacement: "after",
    });
  });

  it("falls back to delta-based reordering inside the active kanban lane", () => {
    // This keeps keyboard/pointer fallback movement deterministic when collision data is missing.
    const tasks = [
      createTaskBoardTask({
        id: "first",
        title: "First",
        columnId: "todo",
        sortIndex: 0,
      }),
      createTaskBoardTask({
        id: "second",
        title: "Second",
        columnId: "todo",
        sortIndex: 1,
      }),
      createTaskBoardTask({
        id: "done-task",
        title: "Done",
        columnId: "done",
        sortIndex: 2,
      }),
    ];

    const target = resolveTaskDropTargetFromDelta({
      tasks,
      sourceTaskId: "first",
      fallbackColumnId: "todo",
      viewMode: TaskBoardViewModeEnum.kanban,
      deltaY: 90,
      itemHeight: 40,
    });

    expect(target).toEqual({
      targetTaskId: "second",
      targetColumnId: "todo",
      targetPlacement: "after",
    });
  });
});
