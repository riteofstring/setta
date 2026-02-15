import { describe, expect, it } from "vitest";
import {
  createTaskBoardColumn,
  createTaskBoardTask,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import { buildTaskBoardLanes, normalizeTaskBoardState } from "./taskBoard";

describe("task board performance", () => {
  it("normalizes and groups large task boards within budget", () => {
    const columns = Array.from({ length: 18 }, (_, index) =>
      createTaskBoardColumn({
        id: `column-${index}`,
        name: `Column ${index}`,
        sortIndex: index,
      }),
    );
    const tasks = Array.from({ length: 4200 }, (_, index) =>
      createTaskBoardTask({
        id: `task-${index}`,
        title: `Task ${index}`,
        sortIndex: index,
        columnId: columns[index % columns.length]?.id ?? null,
      }),
    );

    const start = performance.now();
    const normalized = normalizeTaskBoardState({
      viewMode: TaskBoardViewModeEnum.kanban,
      columns,
      tasks,
    });
    const lanes = buildTaskBoardLanes(normalized);
    const elapsedMs = performance.now() - start;

    const totalTasks = lanes.reduce((sum, lane) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(4200);
    expect(lanes).toHaveLength(18);
    expect(elapsedMs).toBeLessThan(450);
  });
});
