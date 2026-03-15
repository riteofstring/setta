import type { UniqueIdentifier } from "@dnd-kit/abstract";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "forks/dnd-kit/adapter";
import {
  createTaskBoardColumn,
  createTaskBoardTask,
  TaskBoardColumn,
  TaskBoardTask,
  TaskBoardTaskRecurrenceEnum,
  TaskBoardViewMode,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import {
  getNextColumnSortIndex,
  getNextTaskSortIndex,
  type TaskBoardState,
} from "utils/taskBoard";

export const TASK_DND_PREFIX = "task-board-task:";
export const COLUMN_DND_PREFIX = "task-board-column:";
export const TASK_BOARD_LIST_DROP_ID = "task-board-list-drop";
export const TASK_BOARD_NO_DRAG_CLASS_NAME = "task-board-no-drag";
export const TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH = 240;
export const TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH = 180;

export type TaskLane = {
  column: TaskBoardColumn;
  tasks: TaskBoardTask[];
};

export type TaskDropPlacement = "before" | "after";

export type TaskDropTarget = {
  targetTaskId: string | null;
  targetColumnId: string | null;
  targetPlacement: TaskDropPlacement | null;
};

type TaskBoardDropCollisions =
  | DragOverEvent["collisions"]
  | DragEndEvent["collisions"];

export function toTaskDndId(taskId: string): string {
  return `${TASK_DND_PREFIX}${taskId}`;
}

export function toColumnDndId(columnId: string): string {
  return `${COLUMN_DND_PREFIX}${columnId}`;
}

export function getTaskIdFromDndIdentifier(
  id: UniqueIdentifier,
): string | null {
  const idText = String(id);
  if (!idText.startsWith(TASK_DND_PREFIX)) {
    return null;
  }
  return idText.slice(TASK_DND_PREFIX.length);
}

export function getColumnIdFromDndIdentifier(
  id: UniqueIdentifier,
): string | null {
  const idText = String(id);
  if (!idText.startsWith(COLUMN_DND_PREFIX)) {
    return null;
  }
  return idText.slice(COLUMN_DND_PREFIX.length);
}

export function getTaskIdFromDndData(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const taskId = (data as { taskId?: unknown }).taskId;
  if (typeof taskId !== "string" || taskId.trim() === "") {
    return null;
  }
  return taskId;
}

export function getColumnIdFromDndData(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const columnId = (data as { columnId?: unknown }).columnId;
  if (typeof columnId !== "string" || columnId.trim() === "") {
    return null;
  }
  return columnId;
}

export function resolveSourceTaskIdFromDragEvent(
  event: DragStartEvent | DragOverEvent | DragEndEvent,
): string | null {
  return (
    getTaskIdFromDndIdentifier(event.active.id) ??
    getTaskIdFromDndData(event.active.data?.current)
  );
}

function resolveTaskDropPlacementFromCollisions({
  collisions,
  overId,
  sourceTaskId,
  targetTaskId,
  tasks,
}: {
  collisions: TaskBoardDropCollisions;
  overId: UniqueIdentifier;
  sourceTaskId: string;
  targetTaskId: string;
  tasks: TaskBoardTask[];
}): TaskDropPlacement {
  const sourceIndex = tasks.findIndex((task) => task.id === sourceTaskId);
  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);
  if (sourceIndex !== -1 && targetIndex !== -1) {
    if (sourceIndex < targetIndex) {
      return "after";
    }
    if (sourceIndex > targetIndex) {
      return "before";
    }
  }

  const matchingCollision = collisions?.find(
    (collision) => String(collision.id) === String(overId),
  );
  if (matchingCollision) {
    if (matchingCollision.pastHalfway === true) {
      return "after";
    }
    if (matchingCollision.pastHalfway === false) {
      return "before";
    }
  }
  return "before";
}

function resolveTaskBoardOverId({
  sourceTaskId,
  overId,
  collisions,
}: {
  sourceTaskId: string;
  overId: UniqueIdentifier | null;
  collisions: TaskBoardDropCollisions;
}): UniqueIdentifier | null {
  const candidateIds: UniqueIdentifier[] = [];
  if (overId !== null) {
    candidateIds.push(overId);
  }
  collisions?.forEach((collision) => {
    if (
      candidateIds.some(
        (candidateId) => String(candidateId) === String(collision.id),
      )
    ) {
      return;
    }
    candidateIds.push(collision.id);
  });

  for (const candidateId of candidateIds) {
    const candidateTaskId = getTaskIdFromDndIdentifier(candidateId);
    if (candidateTaskId && candidateTaskId !== sourceTaskId) {
      return candidateId;
    }
  }

  for (const candidateId of candidateIds) {
    if (getColumnIdFromDndIdentifier(candidateId)) {
      return candidateId;
    }
  }

  for (const candidateId of candidateIds) {
    if (String(candidateId) === TASK_BOARD_LIST_DROP_ID) {
      return candidateId;
    }
  }

  return overId;
}

export function resolveTaskBoardDropTarget({
  sourceTaskId,
  overId,
  overData,
  collisions,
  tasks,
  fallbackColumnId,
}: {
  sourceTaskId: string;
  overId: UniqueIdentifier | null;
  overData: unknown;
  collisions: TaskBoardDropCollisions;
  tasks: TaskBoardTask[];
  fallbackColumnId: string | null;
}): TaskDropTarget | null {
  const resolvedOverId = resolveTaskBoardOverId({
    sourceTaskId,
    overId,
    collisions,
  });
  if (!resolvedOverId) {
    return null;
  }

  const targetTaskId =
    getTaskIdFromDndData(overData) ??
    getTaskIdFromDndIdentifier(resolvedOverId);
  if (targetTaskId && targetTaskId !== sourceTaskId) {
    const targetTask = tasks.find((task) => task.id === targetTaskId);
    const placementOverId = resolvedOverId ?? overId;
    if (!placementOverId) {
      return null;
    }
    return {
      targetTaskId,
      targetColumnId:
        getColumnIdFromDndData(overData) ??
        targetTask?.columnId ??
        fallbackColumnId,
      targetPlacement: resolveTaskDropPlacementFromCollisions({
        collisions,
        overId: placementOverId,
        sourceTaskId,
        targetTaskId,
        tasks,
      }),
    };
  }

  const targetColumnId =
    getColumnIdFromDndData(overData) ??
    getColumnIdFromDndIdentifier(resolvedOverId) ??
    (String(resolvedOverId) === TASK_BOARD_LIST_DROP_ID
      ? fallbackColumnId
      : null);
  if (!targetColumnId) {
    return null;
  }
  return {
    targetTaskId: null,
    targetColumnId,
    targetPlacement: null,
  };
}

export function resolveTaskDropTargetFromDelta({
  tasks,
  sourceTaskId,
  fallbackColumnId,
  viewMode,
  deltaY,
  itemHeight,
}: {
  tasks: TaskBoardTask[];
  sourceTaskId: string;
  fallbackColumnId: string | null;
  viewMode: TaskBoardViewMode;
  deltaY: number;
  itemHeight: number | null;
}): TaskDropTarget | null {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 6) {
    return null;
  }

  const sourceTask = tasks.find((task) => task.id === sourceTaskId);
  if (!sourceTask) {
    return null;
  }

  let candidateTasks = tasks;
  let sourceColumnId: string | null = null;
  if (viewMode === TaskBoardViewModeEnum.kanban) {
    sourceColumnId = sourceTask.columnId ?? fallbackColumnId;
    if (!sourceColumnId) {
      return null;
    }
    candidateTasks = tasks.filter(
      (task) => (task.columnId ?? fallbackColumnId) === sourceColumnId,
    );
  }

  if (candidateTasks.length < 2) {
    return null;
  }

  const sourceIndex = candidateTasks.findIndex(
    (task) => task.id === sourceTaskId,
  );
  if (sourceIndex < 0) {
    return null;
  }

  const safeItemHeight = Math.max(
    24,
    itemHeight !== null && Number.isFinite(itemHeight) ? itemHeight * 0.8 : 36,
  );
  const offset = Math.round(deltaY / safeItemHeight);
  if (offset === 0) {
    return null;
  }

  const targetIndex = Math.max(
    0,
    Math.min(candidateTasks.length - 1, sourceIndex + offset),
  );
  if (targetIndex === sourceIndex) {
    return null;
  }

  const targetTask = candidateTasks[targetIndex];
  if (!targetTask) {
    return null;
  }

  return {
    targetTaskId: targetTask.id,
    targetColumnId:
      viewMode === TaskBoardViewModeEnum.kanban
        ? sourceColumnId
        : targetTask.columnId ?? fallbackColumnId,
    targetPlacement: targetIndex > sourceIndex ? "after" : "before",
  };
}

function isDoneColumnName(columnName: string): boolean {
  return columnName.trim().toLowerCase() === "done";
}

export function shouldAutoCompleteColumnTask(
  columns: TaskBoardColumn[],
  targetColumnId: string | null,
): boolean {
  if (targetColumnId === null) {
    return false;
  }
  const targetColumn = columns.find((column) => column.id === targetColumnId);
  if (!targetColumn) {
    return false;
  }
  return isDoneColumnName(targetColumn.name);
}

export function findDoneColumnId(columns: TaskBoardColumn[]): string | null {
  const doneColumn = columns.find((column) => isDoneColumnName(column.name));
  if (!doneColumn) {
    return null;
  }
  return doneColumn.id;
}

export function toTaskBoardColumnId(
  task: TaskBoardTask,
  fallbackColumnId: string | null,
): string | null {
  if (task.columnId) {
    return task.columnId;
  }
  return fallbackColumnId;
}

export function toTaskBoardState({
  viewMode,
  columns,
  tasks,
}: {
  viewMode: TaskBoardViewMode;
  columns: TaskBoardColumn[];
  tasks: TaskBoardTask[];
}): TaskBoardState {
  return {
    viewMode,
    columns,
    tasks,
  };
}

export function appendTaskBoardTask(
  state: TaskBoardState,
  args: {
    title: string;
    columnId: string;
  },
): TaskBoardState {
  const title = args.title.trim();
  const task = createTaskBoardTask({
    title: title.length > 0 ? title : "New Task",
    columnId: args.columnId,
    completed: shouldAutoCompleteColumnTask(state.columns, args.columnId),
    recurrence: TaskBoardTaskRecurrenceEnum.none,
    sortIndex: getNextTaskSortIndex(state.tasks),
  });
  return {
    ...state,
    tasks: [...state.tasks, task],
  };
}

export function appendTaskBoardColumn(state: TaskBoardState): TaskBoardState {
  return {
    ...state,
    columns: [
      ...state.columns,
      createTaskBoardColumn({
        name: `Column ${state.columns.length + 1}`,
        color: "#3b82f6",
        sortIndex: getNextColumnSortIndex(state.columns),
      }),
    ],
  };
}

export function updateTaskBoardTask(
  state: TaskBoardState,
  taskId: string,
  patch: Partial<TaskBoardTask>,
): TaskBoardState {
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, ...patch } : task,
    ),
  };
}

export function removeTaskBoardTask(
  state: TaskBoardState,
  taskId: string,
): TaskBoardState {
  const nextTasks = state.tasks
    .filter((task) => task.id !== taskId)
    .map((task, index) => ({ ...task, sortIndex: index }));
  if (nextTasks.length === state.tasks.length) {
    return state;
  }
  return {
    ...state,
    tasks: nextTasks,
  };
}

export function reorderTaskBoardTasks(
  state: TaskBoardState,
  args: {
    sourceTaskId: string;
    targetTaskId?: string;
    targetColumnId?: string;
    targetPlacement?: TaskDropPlacement;
  },
): TaskBoardState {
  const sourceIndex = state.tasks.findIndex(
    (task) => task.id === args.sourceTaskId,
  );
  if (sourceIndex === -1) {
    return state;
  }
  const sourceTask = state.tasks[sourceIndex];
  if (!sourceTask) {
    return state;
  }

  const resolvedTargetColumnId =
    args.targetColumnId ??
    state.tasks.find((task) => task.id === args.targetTaskId)?.columnId ??
    sourceTask.columnId ??
    state.columns[0]?.id ??
    null;
  const tasksWithoutSource = state.tasks.filter(
    (task) => task.id !== args.sourceTaskId,
  );
  let targetIndex = tasksWithoutSource.length;
  if (args.targetTaskId) {
    const targetIndexWithoutSource = tasksWithoutSource.findIndex(
      (task) => task.id === args.targetTaskId,
    );
    if (targetIndexWithoutSource >= 0) {
      const placement = args.targetPlacement ?? "before";
      targetIndex = targetIndexWithoutSource + (placement === "after" ? 1 : 0);
    }
  } else if (resolvedTargetColumnId !== null) {
    let lastLaneIndex = -1;
    tasksWithoutSource.forEach((task, index) => {
      if ((task.columnId ?? null) === resolvedTargetColumnId) {
        lastLaneIndex = index;
      }
    });
    if (lastLaneIndex >= 0) {
      targetIndex = lastLaneIndex + 1;
    }
  }

  const boundedTargetIndex = Math.max(
    0,
    Math.min(tasksWithoutSource.length, targetIndex),
  );
  const sourceTaskWithUpdatedColumn: TaskBoardTask = {
    ...sourceTask,
    columnId: resolvedTargetColumnId,
    completed: shouldAutoCompleteColumnTask(
      state.columns,
      resolvedTargetColumnId,
    )
      ? true
      : sourceTask.completed,
  };
  const nextTasks = [
    ...tasksWithoutSource.slice(0, boundedTargetIndex),
    sourceTaskWithUpdatedColumn,
    ...tasksWithoutSource.slice(boundedTargetIndex),
  ];

  return {
    ...state,
    tasks: nextTasks.map((task, index) => ({
      ...task,
      sortIndex: index,
    })),
  };
}

export function updateTaskBoardColumn(
  state: TaskBoardState,
  columnId: string,
  patch: Partial<TaskBoardColumn>,
): TaskBoardState {
  return {
    ...state,
    columns: state.columns.map((column) =>
      column.id === columnId ? { ...column, ...patch } : column,
    ),
  };
}
