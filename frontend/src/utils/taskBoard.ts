import {
  createTaskBoardColumn,
  TaskBoardColumn,
  TaskBoardTask,
  TaskBoardViewMode,
} from "utils/generatedTypes";

export type TaskBoardLane = {
  column: TaskBoardColumn;
  tasks: TaskBoardTask[];
};

export type TaskBoardState = {
  viewMode: TaskBoardViewMode;
  columns: TaskBoardColumn[];
  tasks: TaskBoardTask[];
};

function compareBySortIndexThenName(
  a: { sortIndex: number; name: string },
  b: { sortIndex: number; name: string },
): number {
  if (a.sortIndex !== b.sortIndex) {
    return a.sortIndex - b.sortIndex;
  }
  return a.name.localeCompare(b.name);
}

function compareTasks(a: TaskBoardTask, b: TaskBoardTask): number {
  if (a.sortIndex !== b.sortIndex) {
    return a.sortIndex - b.sortIndex;
  }
  if (a.completed !== b.completed) {
    return Number(a.completed) - Number(b.completed);
  }
  return a.title.localeCompare(b.title);
}

function normalizeColumns(columns: TaskBoardColumn[]): TaskBoardColumn[] {
  const rawColumns = columns.length
    ? columns
    : [
        createTaskBoardColumn({
          name: "Todo",
          color: "#3b82f6",
          sortIndex: 0,
        }),
      ];
  return [...rawColumns]
    .sort(compareBySortIndexThenName)
    .map((column, index) => ({
      ...column,
      sortIndex: index,
    }));
}

function normalizeTasks({
  tasks,
  validColumnIds,
  fallbackColumnId,
}: {
  tasks: TaskBoardTask[];
  validColumnIds: Set<string>;
  fallbackColumnId: string;
}): TaskBoardTask[] {
  return [...tasks]
    .sort(compareTasks)
    .map((task, index) => ({
      ...task,
      columnId:
        task.columnId && validColumnIds.has(task.columnId)
          ? task.columnId
          : fallbackColumnId,
      sortIndex: index,
    }));
}

export function normalizeTaskBoardState(state: TaskBoardState): TaskBoardState {
  const columns = normalizeColumns(state.columns);
  const validColumnIds = new Set(columns.map((column) => column.id));
  const fallbackColumnId = columns[0].id;
  const tasks = normalizeTasks({
    tasks: state.tasks,
    validColumnIds,
    fallbackColumnId,
  });
  return {
    viewMode: state.viewMode,
    columns,
    tasks,
  };
}

export function buildTaskBoardLanes(state: TaskBoardState): TaskBoardLane[] {
  const normalized = normalizeTaskBoardState(state);
  const tasksByColumnId = new Map<string, TaskBoardTask[]>();
  for (const column of normalized.columns) {
    tasksByColumnId.set(column.id, []);
  }
  for (const task of normalized.tasks) {
    const columnId = task.columnId ?? normalized.columns[0].id;
    const list = tasksByColumnId.get(columnId);
    if (list) {
      list.push(task);
    }
  }
  return normalized.columns.map((column) => ({
    column,
    tasks: tasksByColumnId.get(column.id) ?? [],
  }));
}

export function getNextTaskSortIndex(tasks: TaskBoardTask[]): number {
  if (!tasks.length) {
    return 0;
  }
  return Math.max(...tasks.map((task) => task.sortIndex)) + 1;
}

export function getNextColumnSortIndex(columns: TaskBoardColumn[]): number {
  if (!columns.length) {
    return 0;
  }
  return Math.max(...columns.map((column) => column.sortIndex)) + 1;
}
