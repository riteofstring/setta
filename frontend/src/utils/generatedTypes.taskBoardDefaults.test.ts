import {
  createTaskBoardColumn,
  createTaskBoardSectionImpl,
  createTaskBoardTask,
  createUserDefaultTaskBoardSectionImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated task board defaults", () => {
  it("creates isolated arrays for user default task board settings", () => {
    const first = createUserDefaultTaskBoardSectionImpl();
    const second = createUserDefaultTaskBoardSectionImpl();

    first.columns.push(createTaskBoardColumn({ name: "Backlog" }));
    first.tasks.push(createTaskBoardTask({ title: "Task A" }));

    expect(first.columns).not.toBe(second.columns);
    expect(first.tasks).not.toBe(second.tasks);
    expect(second.columns).toHaveLength(0);
    expect(second.tasks).toHaveLength(0);
  });

  it("creates isolated arrays when section defaults are resolved by schema", () => {
    const defaults = createUserDefaultTaskBoardSectionImpl();
    const first = createTaskBoardSectionImpl(defaults, {
      columns: undefined,
      tasks: undefined,
    });
    const second = createTaskBoardSectionImpl(defaults, {
      columns: undefined,
      tasks: undefined,
    });

    first.columns.push(createTaskBoardColumn({ name: "Todo" }));
    first.tasks.push(createTaskBoardTask({ title: "Task B" }));

    expect(first.columns).not.toBe(second.columns);
    expect(first.tasks).not.toBe(second.tasks);
    expect(second.columns).toHaveLength(0);
    expect(second.tasks).toHaveLength(0);
  });
});
