import {
  createTaskBoardColumn,
  createTaskBoardSectionImpl,
  createTaskBoardTask,
  createUserDefaultTaskBoardSectionImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated task board defaults", () => {
  it("creates task board sections with empty columns by default", () => {
    const first = createTaskBoardSectionImpl();
    const second = createTaskBoardSectionImpl();

    first.columns.push(createTaskBoardColumn({ name: "Todo" }));
    first.tasks.push(createTaskBoardTask({ title: "Task A" }));

    expect(first.columns).not.toBe(second.columns);
    expect(first.tasks).not.toBe(second.tasks);
    expect(second.columns).toEqual([]);
    expect(second.tasks).toEqual([]);
  });

  it("uses a null columns sentinel for user default task board settings", () => {
    const first = createUserDefaultTaskBoardSectionImpl();
    const second = createUserDefaultTaskBoardSectionImpl();

    first.tasks.push(createTaskBoardTask({ title: "Task A" }));

    expect(first.columns).toBeNull();
    expect(second.columns).toBeNull();
    expect(first.tasks).not.toBe(second.tasks);
    expect(second.tasks).toHaveLength(0);
  });

  it("creates isolated explicit arrays for user default task board settings", () => {
    const first = createUserDefaultTaskBoardSectionImpl({
      columns: [],
      tasks: [],
    });
    const second = createUserDefaultTaskBoardSectionImpl({
      columns: [],
      tasks: [],
    });

    first.columns?.push(createTaskBoardColumn({ name: "Backlog" }));
    first.tasks.push(createTaskBoardTask({ title: "Task A" }));

    expect(first.columns).not.toBe(second.columns);
    expect(first.tasks).not.toBe(second.tasks);
    expect(second.columns).toHaveLength(0);
    expect(second.tasks).toHaveLength(0);
  });

  it("creates isolated arrays when section defaults use null columns sentinel", () => {
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
