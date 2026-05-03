import type { UniqueIdentifier } from "@dnd-kit/abstract";

import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";

import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";

import { useMemo } from "react";

import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";

import {
  TaskBoardColumn,
  TaskBoardTask,
  TaskBoardViewMode,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";

import { type TaskBoardState } from "utils/taskBoard";

import {
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";

const TASK_DND_PREFIX = "task-board-task:";

const COLUMN_DND_PREFIX = "task-board-column:";

export const TASK_BOARD_LIST_DROP_ID = "task-board-list-drop";

const TASK_BOARD_NO_DRAG_CLASS_NAME = "task-board-no-drag";

const TASK_BOARD_GPU_CONTROL_PREFIX = "task-board";

export const TASK_BOARD_GPU_SURFACE_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;

export const TASK_BOARD_GPU_CONTROL_CLASS_NAME = `${TASK_BOARD_GPU_SURFACE_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME}`;

const TASK_BOARD_GPU_SCROLL_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`;

export const TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH = 240;

export const TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH = 180;

export type TaskDueMode = "date" | "date_time";

export type TaskLane = {
  column: TaskBoardColumn;
  tasks: TaskBoardTask[];
};

type TaskDropPlacement = "before" | "after";

export type TaskDropTarget = {
  targetTaskId: string | null;
  targetColumnId: string | null;
  targetPlacement: TaskDropPlacement | null;
};

type TaskBoardDndSource = {
  element?: Element | null;
  handle?: Element | null;
};

export function getTaskBoardGpuControlProps(controlId: string) {
  return {
    "data-gpu-flow-control": `${TASK_BOARD_GPU_CONTROL_PREFIX}:${controlId}`,
    "data-gpu-flow-interactive": "true",
  } as const;
}

export function getTaskBoardControlClassName(baseClassName: string): string {
  return `${TASK_BOARD_GPU_CONTROL_CLASS_NAME} ${baseClassName}`;
}

export function getTaskBoardScrollClassName(baseClassName: string): string {
  return `${TASK_BOARD_GPU_SCROLL_CLASS_NAME} ${baseClassName}`;
}

function eventTargetsNoDragElement(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${TASK_BOARD_NO_DRAG_CLASS_NAME}`) !== null;
}

export function useTaskBoardSensors(isDisabled: boolean) {
  return useMemo(() => {
    if (isDisabled) {
      return [];
    }
    const pointerSensor = PointerSensor.configure({
      activatorElements: (source: TaskBoardDndSource) => {
        const activator = source.handle ?? source.element;
        if (activator === null || activator === undefined) {
          return [];
        }
        return [activator];
      },
      activationConstraints: () => {
        return [
          new PointerActivationConstraints.Distance({
            value: 2,
          }),
        ];
      },
      preventActivation: (event) => eventTargetsNoDragElement(event),
    });
    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: (event) => eventTargetsNoDragElement(event),
    });
    return [pointerSensor, keyboardSensor];
  }, [isDisabled]);
}

export function toTaskDndId(taskId: string): string {
  return `${TASK_DND_PREFIX}${taskId}`;
}

export function toColumnDndId(columnId: string): string {
  return `${COLUMN_DND_PREFIX}${columnId}`;
}

function getTaskIdFromDndIdentifier(id: UniqueIdentifier): string | null {
  const idText = String(id);
  if (!idText.startsWith(TASK_DND_PREFIX)) {
    return null;
  }
  return idText.slice(TASK_DND_PREFIX.length);
}

function getColumnIdFromDndIdentifier(id: UniqueIdentifier): string | null {
  const idText = String(id);
  if (!idText.startsWith(COLUMN_DND_PREFIX)) {
    return null;
  }
  return idText.slice(COLUMN_DND_PREFIX.length);
}

function getTaskIdFromDndData(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const taskId = (
    data as {
      taskId?: unknown;
    }
  ).taskId;
  if (typeof taskId !== "string" || taskId.trim() === "") {
    return null;
  }
  return taskId;
}

function getColumnIdFromDndData(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const columnId = (
    data as {
      columnId?: unknown;
    }
  ).columnId;
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
  collisions: DragOverEvent["collisions"] | DragEndEvent["collisions"];
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
  collisions: DragOverEvent["collisions"] | DragEndEvent["collisions"];
}): UniqueIdentifier | null {
  const candidateIds = collectTaskBoardCandidateIds(overId, collisions);
  return (
    findTaskBoardCandidateId(candidateIds, (candidateId) =>
      isTaskBoardTaskDropCandidate(candidateId, sourceTaskId),
    ) ??
    findTaskBoardCandidateId(candidateIds, isTaskBoardColumnDropCandidate) ??
    findTaskBoardCandidateId(candidateIds, isTaskBoardListDropCandidate) ??
    overId
  );
}

function collectTaskBoardCandidateIds(
  overId: UniqueIdentifier | null,
  collisions: DragOverEvent["collisions"] | DragEndEvent["collisions"],
): UniqueIdentifier[] {
  const candidateIds: UniqueIdentifier[] = overId !== null ? [overId] : [];
  collisions?.forEach((collision) => {
    const collisionIdText = String(collision.id);
    if (
      candidateIds.some(
        (candidateId) => String(candidateId) === collisionIdText,
      )
    ) {
      return;
    }
    candidateIds.push(collision.id);
  });
  return candidateIds;
}

function findTaskBoardCandidateId(
  candidateIds: UniqueIdentifier[],
  predicate: (candidateId: UniqueIdentifier) => boolean,
): UniqueIdentifier | null {
  return candidateIds.find(predicate) ?? null;
}

function isTaskBoardTaskDropCandidate(
  candidateId: UniqueIdentifier,
  sourceTaskId: string,
): boolean {
  const candidateTaskId = getTaskIdFromDndIdentifier(candidateId);
  return candidateTaskId !== null && candidateTaskId !== sourceTaskId;
}

function isTaskBoardColumnDropCandidate(
  candidateId: UniqueIdentifier,
): boolean {
  return getColumnIdFromDndIdentifier(candidateId) !== null;
}

function isTaskBoardListDropCandidate(candidateId: UniqueIdentifier): boolean {
  return String(candidateId) === TASK_BOARD_LIST_DROP_ID;
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
  collisions: DragOverEvent["collisions"] | DragEndEvent["collisions"];
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
  const targetTaskId = resolveTaskBoardDropTargetTaskID(
    sourceTaskId,
    overData,
    resolvedOverId,
  );
  if (targetTaskId) {
    return buildTaskBoardTaskDropTarget({
      sourceTaskId,
      targetTaskId,
      resolvedOverId,
      overData,
      collisions,
      tasks,
      fallbackColumnId,
    });
  }
  return buildTaskBoardColumnDropTarget(
    resolvedOverId,
    overData,
    fallbackColumnId,
  );
}

function resolveTaskBoardDropTargetTaskID(
  sourceTaskId: string,
  overData: unknown,
  resolvedOverId: UniqueIdentifier,
): string | null {
  const targetTaskId =
    getTaskIdFromDndData(overData) ??
    getTaskIdFromDndIdentifier(resolvedOverId);
  if (!targetTaskId || targetTaskId === sourceTaskId) {
    return null;
  }
  return targetTaskId;
}

function buildTaskBoardTaskDropTarget({
  sourceTaskId,
  targetTaskId,
  resolvedOverId,
  overData,
  collisions,
  tasks,
  fallbackColumnId,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  resolvedOverId: UniqueIdentifier;
  overData: unknown;
  collisions: DragOverEvent["collisions"] | DragEndEvent["collisions"];
  tasks: TaskBoardTask[];
  fallbackColumnId: string | null;
}): TaskDropTarget {
  const targetTask = tasks.find((task) => task.id === targetTaskId);
  return {
    targetTaskId,
    targetColumnId:
      getColumnIdFromDndData(overData) ??
      targetTask?.columnId ??
      fallbackColumnId,
    targetPlacement: resolveTaskDropPlacementFromCollisions({
      collisions,
      overId: resolvedOverId,
      sourceTaskId,
      targetTaskId,
      tasks,
    }),
  };
}

function buildTaskBoardColumnDropTarget(
  resolvedOverId: UniqueIdentifier,
  overData: unknown,
  fallbackColumnId: string | null,
): TaskDropTarget | null {
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

function resolveTaskDropTargetFromDelta({
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
  const sourceTask = tasks.find((task) => task.id === sourceTaskId);
  if (!sourceTask) {
    return null;
  }
  const offset = resolveTaskDropTargetDeltaOffset(deltaY, itemHeight);
  if (offset === null) {
    return null;
  }
  const candidateTasks = resolveTaskDropTargetCandidates({
    tasks,
    sourceTask,
    fallbackColumnId,
    viewMode,
  });
  if (!candidateTasks) {
    return null;
  }
  const sourceIndex = candidateTasks.tasks.findIndex(
    (task) => task.id === sourceTaskId,
  );
  if (sourceIndex < 0) {
    return null;
  }
  if (candidateTasks.tasks.length < 2) {
    return null;
  }
  const targetIndex = Math.max(
    0,
    Math.min(candidateTasks.tasks.length - 1, sourceIndex + offset),
  );
  if (targetIndex === sourceIndex) {
    return null;
  }
  const targetTask = candidateTasks.tasks[targetIndex];
  if (!targetTask) {
    return null;
  }
  return {
    targetTaskId: targetTask.id,
    targetColumnId: resolveTaskDropTargetColumnID(
      viewMode,
      candidateTasks.sourceColumnId,
      targetTask,
      fallbackColumnId,
    ),
    targetPlacement: targetIndex > sourceIndex ? "after" : "before",
  };
}

function resolveTaskDropTargetDeltaOffset(
  deltaY: number,
  itemHeight: number | null,
): number | null {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 6) {
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
  return offset;
}

function resolveTaskDropTargetCandidates({
  tasks,
  sourceTask,
  fallbackColumnId,
  viewMode,
}: {
  tasks: TaskBoardTask[];
  sourceTask: TaskBoardTask;
  fallbackColumnId: string | null;
  viewMode: TaskBoardViewMode;
}): {
  tasks: TaskBoardTask[];
  sourceColumnId: string | null;
} | null {
  if (viewMode !== TaskBoardViewModeEnum.kanban) {
    return {
      tasks,
      sourceColumnId: null,
    };
  }
  const sourceColumnId = sourceTask.columnId ?? fallbackColumnId;
  if (!sourceColumnId) {
    return null;
  }
  return {
    tasks: tasks.filter(
      (task) => (task.columnId ?? fallbackColumnId) === sourceColumnId,
    ),
    sourceColumnId,
  };
}

function resolveTaskDropTargetColumnID(
  viewMode: TaskBoardViewMode,
  sourceColumnId: string | null,
  targetTask: TaskBoardTask,
  fallbackColumnId: string | null,
): string | null {
  if (viewMode === TaskBoardViewModeEnum.kanban) {
    return sourceColumnId;
  }
  return targetTask.columnId ?? fallbackColumnId;
}

export function getTaskDueMode(dueDateIso: string): TaskDueMode {
  if (dueDateIso.includes("T")) {
    return "date_time";
  }
  return "date";
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

export function resolveTaskDateValue(dueDateIso: string): string {
  const split = splitIsoDateAndTimeParts(dueDateIso);
  if (split) {
    return split.dateIso;
  }
  return normalizeDateToIso(dueDateIso, "iso");
}

export function resolveTaskDateTimeValue(dueDateIso: string): string {
  const normalized = normalizeDateTimeToLocalIso(dueDateIso);
  if (normalized !== "") {
    return normalized;
  }
  const normalizedDate = normalizeDateToIso(dueDateIso, "iso");
  if (normalizedDate === "") {
    return "";
  }
  return `${normalizedDate}T09:00`;
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

export type ReorderTaskArgs = {
  sourceTaskId: string;
  targetTaskId?: string;
  targetColumnId?: string;
  targetPlacement?: TaskDropPlacement;
};

function resolveReorderTargetColumnID(
  tasks: TaskBoardTask[],
  columns: TaskBoardColumn[],
  sourceTask: TaskBoardTask,
  targetTaskId: string | undefined,
  targetColumnId: string | undefined,
): string | null {
  return (
    targetColumnId ??
    tasks.find((task) => task.id === targetTaskId)?.columnId ??
    sourceTask.columnId ??
    columns[0]?.id ??
    null
  );
}

function resolveReorderTargetIndex(
  tasksWithoutSource: TaskBoardTask[],
  targetTaskId: string | undefined,
  targetPlacement: TaskDropPlacement | undefined,
  resolvedTargetColumnId: string | null,
): number {
  if (targetTaskId) {
    return resolveReorderTaskIndexByTargetTask(
      tasksWithoutSource,
      targetTaskId,
      targetPlacement,
    );
  }
  return resolveReorderTaskIndexByTargetColumn(
    tasksWithoutSource,
    resolvedTargetColumnId,
  );
}

function resolveReorderTaskIndexByTargetTask(
  tasksWithoutSource: TaskBoardTask[],
  targetTaskId: string,
  targetPlacement: TaskDropPlacement | undefined,
): number {
  const targetIndexWithoutSource = tasksWithoutSource.findIndex(
    (task) => task.id === targetTaskId,
  );
  if (targetIndexWithoutSource < 0) {
    return tasksWithoutSource.length;
  }
  const placement = targetPlacement ?? "before";
  return targetIndexWithoutSource + (placement === "after" ? 1 : 0);
}

function resolveReorderTaskIndexByTargetColumn(
  tasksWithoutSource: TaskBoardTask[],
  resolvedTargetColumnId: string | null,
): number {
  if (resolvedTargetColumnId === null) {
    return tasksWithoutSource.length;
  }
  let lastLaneIndex = -1;
  tasksWithoutSource.forEach((task, index) => {
    if ((task.columnId ?? null) === resolvedTargetColumnId) {
      lastLaneIndex = index;
    }
  });
  if (lastLaneIndex < 0) {
    return tasksWithoutSource.length;
  }
  return lastLaneIndex + 1;
}

export function buildReorderedTaskList(
  current: TaskBoardState,
  {
    sourceTaskId,
    targetTaskId,
    targetColumnId,
    targetPlacement,
  }: ReorderTaskArgs,
): TaskBoardTask[] | null {
  const sourceTask = current.tasks.find((task) => task.id === sourceTaskId);
  if (!sourceTask) {
    return null;
  }
  const resolvedTargetColumnId = resolveReorderTargetColumnID(
    current.tasks,
    current.columns,
    sourceTask,
    targetTaskId,
    targetColumnId,
  );
  const tasksWithoutSource = current.tasks.filter(
    (task) => task.id !== sourceTaskId,
  );
  const targetIndex = resolveReorderTargetIndex(
    tasksWithoutSource,
    targetTaskId,
    targetPlacement,
    resolvedTargetColumnId,
  );
  const boundedTargetIndex = Math.max(
    0,
    Math.min(tasksWithoutSource.length, targetIndex),
  );
  const sourceTaskWithUpdatedColumn = {
    ...sourceTask,
    columnId: resolvedTargetColumnId,
    completed: shouldAutoCompleteColumnTask(
      current.columns,
      resolvedTargetColumnId,
    )
      ? true
      : sourceTask.completed,
  };
  return [
    ...tasksWithoutSource.slice(0, boundedTargetIndex),
    sourceTaskWithUpdatedColumn,
    ...tasksWithoutSource.slice(boundedTargetIndex),
  ].map((task, index) => ({
    ...task,
    sortIndex: index,
  }));
}

export function resolveDragEndDropTarget({
  event,
  sourceTaskId,
  latestDropTarget,
  fallbackColumnId,
  normalizedState,
  itemHeight,
}: {
  event: DragEndEvent;
  sourceTaskId: string;
  latestDropTarget: TaskDropTarget | null;
  fallbackColumnId: string | null;
  normalizedState: TaskBoardState;
  itemHeight: number | null;
}): TaskDropTarget | null {
  const dropTargetFromCollision = resolveTaskBoardDropTarget({
    sourceTaskId,
    overId: event.over?.id ?? null,
    overData: event.over?.data?.current,
    collisions: event.collisions,
    tasks: normalizedState.tasks,
    fallbackColumnId,
  });
  if (dropTargetFromCollision) {
    return dropTargetFromCollision;
  }
  return (
    latestDropTarget ??
    resolveTaskDropTargetFromDelta({
      tasks: normalizedState.tasks,
      sourceTaskId,
      fallbackColumnId,
      viewMode: normalizedState.viewMode,
      deltaY: event.delta.y,
      itemHeight,
    })
  );
}

export function applyTaskDropTarget(
  reorderTask: (args: ReorderTaskArgs) => void,
  sourceTaskId: string,
  dropTarget: TaskDropTarget,
) {
  if (dropTarget.targetTaskId !== null) {
    reorderTask({
      sourceTaskId,
      targetTaskId: dropTarget.targetTaskId,
      ...(dropTarget.targetColumnId !== null
        ? { targetColumnId: dropTarget.targetColumnId }
        : {}),
      ...(dropTarget.targetPlacement !== null
        ? { targetPlacement: dropTarget.targetPlacement }
        : {}),
    });
    return;
  }
  if (dropTarget.targetColumnId !== null) {
    reorderTask({
      sourceTaskId,
      targetColumnId: dropTarget.targetColumnId,
    });
  }
}

export function formatTaskDueSummary(dueDateIso: string): string | null {
  if (dueDateIso.trim() === "") {
    return null;
  }
  if (getTaskDueMode(dueDateIso) === "date_time") {
    const value = resolveTaskDateTimeValue(dueDateIso);
    if (value === "") {
      return null;
    }
    return value.replace("T", " ");
  }
  const value = resolveTaskDateValue(dueDateIso);
  return value === "" ? null : value;
}

export function formatTaskDueCardSummary(dueDateIso: string): string | null {
  if (dueDateIso.trim() === "") {
    return null;
  }
  if (getTaskDueMode(dueDateIso) === "date_time") {
    const value = resolveTaskDateTimeValue(dueDateIso);
    if (value === "") {
      return null;
    }
    return `Due: ${value.replace("T", " ")}`;
  }
  const value = resolveTaskDateValue(dueDateIso);
  if (value === "") {
    return null;
  }
  return `Due: ${value}`;
}
