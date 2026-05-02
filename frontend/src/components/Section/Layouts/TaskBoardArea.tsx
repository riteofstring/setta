import type { UniqueIdentifier } from "@dnd-kit/abstract";
import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { callOpenAPI, createNewId } from "@setta/app-subsystem-frontend-sdk";
import { ResizeHandle } from "components/Params/ResizeHandle";
import {
  DragDropProvider,
  SortableContext,
  useDroppable,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";
import {
  applyZoomToTransform,
  transformToString,
} from "forks/dnd-kit/adapter/zoom";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import { getZoom } from "gpuFlow/viewportActions";
import { setTaskBoardSectionState } from "openapi/http";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FiCalendar,
  FiColumns,
  FiList,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import { MdOutlinePlaylistAdd, MdPlaylistRemove } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";
import {
  createTaskBoardColumn,
  createTaskBoardTask,
  SectionTypeEnum,
  TaskBoardColumn,
  TaskBoardTask,
  TaskBoardTaskRecurrence,
  TaskBoardTaskRecurrenceEnum,
  TaskBoardUIConfig,
  TaskBoardViewMode,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import {
  applyTaskBoardMutation,
  buildTaskBoardLanes,
  getNextColumnSortIndex,
  getNextTaskSortIndex,
  normalizeTaskBoardState,
  type TaskBoardMutationKind,
  type TaskBoardState,
} from "utils/taskBoard";
import {
  combineIsoDateAndTimeParts,
  getLocalTodayIsoDate,
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";
import { shallow } from "zustand/shallow";
import {
  areNumberArraysEqual,
  formatTaskRecurrenceCardSummary,
  formatTaskRecurrenceSummary,
  getEffectiveRecurrenceDays,
  getEffectiveRecurrenceMonths,
  getEffectiveRecurrenceYears,
  parseRecurrenceYears,
  sortRecurringMonths,
  sortRecurringWeekdays,
} from "./taskBoardRecurrence";
const TASK_DND_PREFIX = "task-board-task:";
const COLUMN_DND_PREFIX = "task-board-column:";
const TASK_BOARD_LIST_DROP_ID = "task-board-list-drop";
const TASK_BOARD_NO_DRAG_CLASS_NAME = "task-board-no-drag";
const TASK_BOARD_GPU_CONTROL_PREFIX = "task-board";
const TASK_BOARD_GPU_SURFACE_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
const TASK_BOARD_GPU_CONTROL_CLASS_NAME = `${TASK_BOARD_GPU_SURFACE_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME}`;
const TASK_BOARD_GPU_SCROLL_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`;
const TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH = 240;
const TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH = 180;
type TaskDueMode = "date" | "date_time";
type TaskLane = {
  column: TaskBoardColumn;
  tasks: TaskBoardTask[];
};
type TaskDropPlacement = "before" | "after";
type TaskDropTarget = {
  targetTaskId: string | null;
  targetColumnId: string | null;
  targetPlacement: TaskDropPlacement | null;
};
type TaskBoardDndSource = {
  element?: Element | null;
  handle?: Element | null;
};
function getTaskBoardGpuControlProps(controlId: string) {
  return {
    "data-gpu-flow-control": `${TASK_BOARD_GPU_CONTROL_PREFIX}:${controlId}`,
    "data-gpu-flow-interactive": "true",
  } as const;
}
function getTaskBoardControlClassName(baseClassName: string): string {
  return `${TASK_BOARD_GPU_CONTROL_CLASS_NAME} ${baseClassName}`;
}
function getTaskBoardScrollClassName(baseClassName: string): string {
  return `${TASK_BOARD_GPU_SCROLL_CLASS_NAME} ${baseClassName}`;
}
function eventTargetsNoDragElement(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${TASK_BOARD_NO_DRAG_CLASS_NAME}`) !== null;
}
function useTaskBoardSensors(isDisabled: boolean) {
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
function toTaskDndId(taskId: string): string {
  return `${TASK_DND_PREFIX}${taskId}`;
}
function toColumnDndId(columnId: string): string {
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
function resolveSourceTaskIdFromDragEvent(
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
function resolveTaskBoardDropTarget({
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
function getTaskDueMode(dueDateIso: string): TaskDueMode {
  if (dueDateIso.includes("T")) {
    return "date_time";
  }
  return "date";
}
function isDoneColumnName(columnName: string): boolean {
  return columnName.trim().toLowerCase() === "done";
}
function shouldAutoCompleteColumnTask(
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
function findDoneColumnId(columns: TaskBoardColumn[]): string | null {
  const doneColumn = columns.find((column) => isDoneColumnName(column.name));
  if (!doneColumn) {
    return null;
  }
  return doneColumn.id;
}
function resolveTaskDateValue(dueDateIso: string): string {
  const split = splitIsoDateAndTimeParts(dueDateIso);
  if (split) {
    return split.dateIso;
  }
  return normalizeDateToIso(dueDateIso, "iso");
}
function resolveTaskDateTimeValue(dueDateIso: string): string {
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
function toTaskBoardColumnId(
  task: TaskBoardTask,
  fallbackColumnId: string | null,
): string | null {
  if (task.columnId) {
    return task.columnId;
  }
  return fallbackColumnId;
}
function toTaskBoardState({
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
type ReorderTaskArgs = {
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

function buildReorderedTaskList(
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

function resolveDragEndDropTarget({
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

function applyTaskDropTarget(
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
function formatTaskDueSummary(dueDateIso: string): string | null {
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
function formatTaskDueCardSummary(dueDateIso: string): string | null {
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
export function TaskBoardArea({ sectionId }: { sectionId: string }) {
  const { canEditLayout } = useShareCapabilities();
  const { viewMode, columns, tasks, isFrozen } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.TaskBoard,
    );
    return {
      viewMode: impl.viewMode,
      columns: impl.columns,
      tasks: impl.tasks,
      isFrozen: impl.isFrozen,
    };
  }, shallow);
  const isDisabled = isFrozen || !canEditLayout;
  const normalizedState = useMemo(
    () =>
      normalizeTaskBoardState(toTaskBoardState({ viewMode, columns, tasks })),
    [viewMode, columns, tasks],
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const dragTaskHeightRef = useRef<number | null>(null);
  const latestDropTargetRef = useRef<TaskDropTarget | null>(null);
  const lanes = useMemo(
    () => buildTaskBoardLanes(normalizedState),
    [normalizedState],
  );
  const fallbackColumnId = normalizedState.columns[0]?.id ?? null;
  const taskBoardSensors = useTaskBoardSensors(isDisabled);
  const kanbanColumnsContainerRef = useRef<HTMLDivElement | null>(null);
  const [kanbanColumnWidthsById, setKanbanColumnWidthsById] = useState<
    Record<string, number>
  >({});
  const kanbanResizeAnimationFrameRef = useRef<number | null>(null);
  const kanbanResizeCleanupRef = useRef<(() => void) | null>(null);
  const getKanbanColumnWidth = useCallback(
    (columnId: string): number => {
      const width = kanbanColumnWidthsById[columnId];
      if (typeof width === "number" && Number.isFinite(width)) {
        return Math.max(TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH, width);
      }
      return TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH;
    },
    [kanbanColumnWidthsById],
  );
  useEffect(() => {
    setKanbanColumnWidthsById((current) => {
      const columnIds = new Set(
        normalizedState.columns.map((column) => column.id),
      );
      let didChange = false;
      const next: Record<string, number> = {};
      Object.entries(current).forEach(([columnId, width]) => {
        if (columnIds.has(columnId)) {
          next[columnId] = width;
          return;
        }
        didChange = true;
      });
      if (!didChange) {
        return current;
      }
      return next;
    });
  }, [normalizedState.columns]);
  const cleanupKanbanResizeListeners = useCallback(() => {
    if (kanbanResizeCleanupRef.current !== null) {
      kanbanResizeCleanupRef.current();
      kanbanResizeCleanupRef.current = null;
    }
    if (kanbanResizeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(kanbanResizeAnimationFrameRef.current);
      kanbanResizeAnimationFrameRef.current = null;
    }
  }, []);
  useEffect(() => {
    return () => {
      cleanupKanbanResizeListeners();
    };
  }, [cleanupKanbanResizeListeners]);
  const handleKanbanColumnResizeStart = useCallback(
    (columnId: string, event: React.MouseEvent<HTMLDivElement>) => {
      if (isDisabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const containerWidth =
        kanbanColumnsContainerRef.current?.clientWidth ?? 0;
      const maxWidth =
        containerWidth > 0
          ? Math.max(
              TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH,
              containerWidth - TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH,
            )
          : TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH * 2;
      if (event.detail === 2) {
        setKanbanColumnWidthsById((current) => {
          if (!(columnId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[columnId];
          return next;
        });
        return;
      }
      const startX = event.clientX;
      const startWidth = getKanbanColumnWidth(columnId);
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (kanbanResizeAnimationFrameRef.current !== null) {
          cancelAnimationFrame(kanbanResizeAnimationFrameRef.current);
        }
        kanbanResizeAnimationFrameRef.current = requestAnimationFrame(() => {
          const zoom = getZoom();
          const scale = zoom === 0 ? 1 : zoom;
          const deltaX = (moveEvent.clientX - startX) / scale;
          const nextWidth = Math.max(
            TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH,
            Math.min(maxWidth, startWidth + deltaX),
          );
          setKanbanColumnWidthsById((current) => {
            if (current[columnId] === nextWidth) {
              return current;
            }
            return {
              ...current,
              [columnId]: nextWidth,
            };
          });
          kanbanResizeAnimationFrameRef.current = null;
        });
      };
      const handleMouseUp = () => {
        cleanupKanbanResizeListeners();
      };
      cleanupKanbanResizeListeners();
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      kanbanResizeCleanupRef.current = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    },
    [cleanupKanbanResizeListeners, getKanbanColumnWidth, isDisabled],
  );
  const persistState = useCallback(
    ({
      mutator,
      kind,
    }: {
      mutator: (state: TaskBoardState) => TaskBoardState;
      kind: TaskBoardMutationKind;
    }) => {
      let nextStateForSend: TaskBoardState | null = null;
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          const currentImpl = getCurrEffectiveSectionImplOfType(
            state,
            sectionId,
            SectionTypeEnum.TaskBoard,
          );
          const next = applyTaskBoardMutation({
            state: toTaskBoardState({
              viewMode: currentImpl.viewMode,
              columns: currentImpl.columns,
              tasks: currentImpl.tasks,
            }),
            mutator,
            kind,
          });
          nextStateForSend = next;
          setCurrEffectiveSectionImplValue<"TaskBoardSection">(
            state,
            sectionId,
            {
              viewMode: next.viewMode,
              columns: next.columns,
              tasks: next.tasks,
            },
          );
        },
        send: (frontendOpId) => {
          if (nextStateForSend === null) {
            throw new Error(
              "Task board update failed to compute next optimistic state.",
            );
          }
          return callOpenAPI(
            setTaskBoardSectionState({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                viewMode: nextStateForSend.viewMode,
                columns: nextStateForSend.columns,
                tasks: nextStateForSend.tasks,
                frontendOpId,
              },
            } as Parameters<typeof setTaskBoardSectionState>[0]),
          );
        },
      });
    },
    [sectionId],
  );
  const updateState = useCallback(
    (
      mutator: (state: TaskBoardState) => TaskBoardState,
      kind: TaskBoardMutationKind = "structural",
    ) => {
      persistState({ mutator, kind });
    },
    [persistState],
  );
  const addTask = useCallback(
    (columnId?: string) => {
      if (isDisabled) {
        return;
      }
      const title = newTaskTitle.trim();
      const defaultColumnId =
        columnId ?? normalizedState.columns[0]?.id ?? null;
      if (!defaultColumnId) {
        return;
      }
      const task = createTaskBoardTask({
        id: createNewId(),
        title: title.length > 0 ? title : "New Task",
        columnId: defaultColumnId,
        completed: shouldAutoCompleteColumnTask(
          normalizedState.columns,
          defaultColumnId,
        ),
        recurrence: TaskBoardTaskRecurrenceEnum.none,
        sortIndex: getNextTaskSortIndex(normalizedState.tasks),
      });
      setNewTaskTitle("");
      updateState((current) => ({
        ...current,
        tasks: [...current.tasks, task],
      }));
    },
    [
      isDisabled,
      newTaskTitle,
      normalizedState.columns,
      normalizedState.tasks,
      updateState,
    ],
  );
  const addColumn = useCallback(() => {
    if (isDisabled) {
      return;
    }
    updateState((current) => ({
      ...current,
      columns: [
        ...current.columns,
        createTaskBoardColumn({
          id: createNewId(),
          name: `Column ${current.columns.length + 1}`,
          color: "#3b82f6",
          sortIndex: getNextColumnSortIndex(current.columns),
        }),
      ],
    }));
  }, [isDisabled, updateState]);
  const setViewMode = useCallback(
    (nextViewMode: TaskBoardViewMode) => {
      if (isDisabled || nextViewMode === normalizedState.viewMode) {
        return;
      }
      updateState(
        (current) => ({
          ...current,
          viewMode: nextViewMode,
        }),
        "non_structural",
      );
    },
    [isDisabled, normalizedState.viewMode, updateState],
  );
  const updateTask = useCallback(
    (taskId: string, patch: Partial<TaskBoardTask>) => {
      if (isDisabled) {
        return;
      }
      updateState(
        (current) => ({
          ...current,
          tasks: current.tasks.map((task) =>
            task.id === taskId ? { ...task, ...patch } : task,
          ),
        }),
        "non_structural",
      );
    },
    [isDisabled, updateState],
  );
  const removeTask = useCallback(
    (taskId: string) => {
      if (isDisabled) {
        return;
      }
      updateState((current) => {
        const nextTasks = current.tasks
          .filter((task) => task.id !== taskId)
          .map((task, index) => ({ ...task, sortIndex: index }));
        if (nextTasks.length === current.tasks.length) {
          return current;
        }
        return {
          ...current,
          tasks: nextTasks,
        };
      });
    },
    [isDisabled, updateState],
  );
  const reorderTask = useCallback(
    (args: ReorderTaskArgs) => {
      if (isDisabled) {
        return;
      }
      updateState((current) => {
        const nextTasks = buildReorderedTaskList(current, args);
        if (!nextTasks) {
          return current;
        }
        return {
          ...current,
          tasks: nextTasks,
        };
      });
    },
    [isDisabled, updateState],
  );
  const updateColumn = useCallback(
    (columnId: string, patch: Partial<TaskBoardColumn>) => {
      if (isDisabled) {
        return;
      }
      updateState(
        (current) => ({
          ...current,
          columns: current.columns.map((column) =>
            column.id === columnId ? { ...column, ...patch } : column,
          ),
        }),
        "non_structural",
      );
    },
    [isDisabled, updateState],
  );
  const handleTaskBoardDragStart = useCallback((event: DragStartEvent) => {
    const taskId = resolveSourceTaskIdFromDragEvent(event);
    setDraggingTaskId(taskId);
    dragTaskHeightRef.current = event.activeRect.height;
    latestDropTargetRef.current = null;
  }, []);
  const handleTaskBoardDragOver = useCallback(
    (event: DragOverEvent) => {
      const sourceTaskId =
        resolveSourceTaskIdFromDragEvent(event) ?? draggingTaskId;
      if (!sourceTaskId) {
        latestDropTargetRef.current = null;
        return;
      }
      latestDropTargetRef.current = resolveTaskBoardDropTarget({
        sourceTaskId,
        overId: event.over?.id ?? null,
        overData: event.over?.data?.current,
        collisions: event.collisions,
        tasks: normalizedState.tasks,
        fallbackColumnId,
      });
    },
    [draggingTaskId, fallbackColumnId, normalizedState.tasks],
  );
  const handleTaskBoardDragCancel = useCallback(() => {
    setDraggingTaskId(null);
    dragTaskHeightRef.current = null;
    latestDropTargetRef.current = null;
  }, []);
  const handleTaskBoardDragEnd = useCallback(
    (event: DragEndEvent) => {
      const sourceTaskId =
        resolveSourceTaskIdFromDragEvent(event) ?? draggingTaskId;
      setDraggingTaskId(null);
      if (!sourceTaskId) {
        dragTaskHeightRef.current = null;
        latestDropTargetRef.current = null;
        return;
      }
      const dropTarget = resolveDragEndDropTarget({
        event,
        sourceTaskId,
        latestDropTarget: latestDropTargetRef.current,
        fallbackColumnId,
        normalizedState,
        itemHeight: dragTaskHeightRef.current,
      });
      dragTaskHeightRef.current = null;
      latestDropTargetRef.current = null;
      if (!dropTarget) {
        return;
      }
      applyTaskDropTarget(reorderTask, sourceTaskId, dropTarget);
    },
    [
      draggingTaskId,
      fallbackColumnId,
      normalizedState,
      normalizedState.tasks,
      normalizedState.viewMode,
      reorderTask,
    ],
  );
  const taskListItems = useMemo(
    () => normalizedState.tasks.map((task) => toTaskDndId(task.id)),
    [normalizedState.tasks],
  );
  const dndContextValue = useMemo(
    () => ({
      isMovingFree: false,
      isSorting: false,
    }),
    [],
  );
  return (
    <div
      className={`section-main section-main-full-w flex h-full min-w-[320px] flex-col gap-2 ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
      {...getTaskBoardGpuControlProps(`${sectionId}:surface`)}
    >
      <div
        className="mx-1 mt-2 flex shrink-0 flex-wrap items-center gap-2"
        {...getTaskBoardGpuControlProps(`${sectionId}:toolbar`)}
      >
        {TaskBoardUIConfig.viewModeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            {...getTaskBoardGpuControlProps(
              `${sectionId}:view-mode:${option.value}`,
            )}
            data-testid={
              option.value === TaskBoardViewModeEnum.task_list
                ? "task-board-view-task-list"
                : "task-board-view-kanban"
            }
            className={getTaskBoardControlClassName(
              `inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                normalizedState.viewMode === option.value
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
                  : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              }`,
            )}
            onClick={() => setViewMode(option.value)}
            disabled={isDisabled}
            aria-label={`${option.label} view`}
          >
            {option.value === TaskBoardViewModeEnum.task_list ? (
              <FiList size={14} />
            ) : (
              <FiColumns size={14} />
            )}
            {option.label}
          </button>
        ))}
        <input
          {...getTaskBoardGpuControlProps(`${sectionId}:new-task-title`)}
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTask();
            }
          }}
          disabled={isDisabled}
          placeholder="Add task title"
          className={getTaskBoardControlClassName(
            "min-w-0 flex-1 rounded-md border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200",
          )}
        />
        {normalizedState.viewMode === TaskBoardViewModeEnum.task_list ? (
          <button
            type="button"
            {...getTaskBoardGpuControlProps(`${sectionId}:add-task`)}
            data-testid="task-board-add-task"
            className={getTaskBoardControlClassName(
              "inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800",
            )}
            onClick={() => addTask()}
            disabled={isDisabled}
          >
            <FiPlus size={12} />
            Task
          </button>
        ) : null}
        <button
          type="button"
          {...getTaskBoardGpuControlProps(`${sectionId}:add-column`)}
          data-testid="task-board-add-column"
          className={getTaskBoardControlClassName(
            "inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800",
          )}
          onClick={addColumn}
          disabled={isDisabled}
        >
          <FiPlus size={12} />
          Column
        </button>
      </div>

      <DragDropProvider
        sensors={taskBoardSensors}
        dndContext={dndContextValue}
        onDragStart={handleTaskBoardDragStart}
        onDragOver={handleTaskBoardDragOver}
        onDragCancel={handleTaskBoardDragCancel}
        onDragEnd={handleTaskBoardDragEnd}
        debugLabel="task-board"
      >
        <DragOperationShapeSync enabled />
        {normalizedState.viewMode === TaskBoardViewModeEnum.task_list ? (
          <div
            className={getTaskBoardScrollClassName(
              "min-h-0 flex-1 overflow-auto p-1",
            )}
            {...getTaskBoardGpuControlProps(`${sectionId}:task-list-scroll`)}
          >
            <div
              className="grid grid-cols-[24px_minmax(0,1fr)_132px] items-center gap-2 border-b border-setta-200 bg-setta-50/80 px-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400"
              data-testid="task-board-task-list-header"
            >
              <span aria-hidden="true" />
              <span>Task</span>
              <span>Column</span>
            </div>
            <SortableContext
              id={`${sectionId}:task-list`}
              items={taskListItems}
              strategy={verticalListSortingStrategy}
              forceSorting
            >
              <TaskBoardListDropZone fallbackColumnId={fallbackColumnId}>
                {normalizedState.tasks.map((task) => (
                  <TaskBoardTaskListRow
                    key={task.id}
                    task={task}
                    fallbackColumnId={fallbackColumnId}
                    columns={normalizedState.columns}
                    isDisabled={isDisabled}
                    isDragging={draggingTaskId === task.id}
                    updateTask={updateTask}
                    removeTask={removeTask}
                  />
                ))}
              </TaskBoardListDropZone>
            </SortableContext>
            {normalizedState.tasks.length === 0 ? (
              <div className="px-3 py-4 text-xs text-setta-500 dark:text-setta-400">
                No tasks yet. Add your first task above.
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={getTaskBoardScrollClassName(
              "min-h-0 flex-1 overflow-auto p-1",
            )}
            {...getTaskBoardGpuControlProps(`${sectionId}:kanban-scroll`)}
          >
            <div
              ref={kanbanColumnsContainerRef}
              className="flex h-full min-w-fit items-stretch"
            >
              {lanes.map((lane, laneIndex) => (
                <Fragment key={lane.column.id}>
                  {laneIndex > 0 && !isDisabled ? (
                    <TaskBoardKanbanColumnResizeHandle
                      dividerIndex={laneIndex - 1}
                      onMouseDown={(event) => {
                        const leftLane = lanes[laneIndex - 1];
                        if (!leftLane) {
                          return;
                        }
                        handleKanbanColumnResizeStart(
                          leftLane.column.id,
                          event,
                        );
                      }}
                    />
                  ) : null}
                  <TaskBoardKanbanLane
                    lane={lane}
                    columnWidth={getKanbanColumnWidth(lane.column.id)}
                    isDisabled={isDisabled}
                    draggingTaskId={draggingTaskId}
                    updateTask={updateTask}
                    removeTask={removeTask}
                    updateColumn={updateColumn}
                    addTask={addTask}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </DragDropProvider>
    </div>
  );
}
function TaskBoardListDropZone({
  children,
  fallbackColumnId,
}: {
  children: ReactNode;
  fallbackColumnId: string | null;
}) {
  const dropId =
    fallbackColumnId !== null
      ? toColumnDndId(fallbackColumnId)
      : TASK_BOARD_LIST_DROP_ID;
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: {
      type: "task-board-list",
      columnId: fallbackColumnId,
    },
  });
  return (
    <div
      ref={setNodeRef}
      className={getTaskBoardScrollClassName(
        `${isOver ? "bg-blue-50/40 dark:bg-blue-950/30" : ""}`,
      )}
      {...getTaskBoardGpuControlProps(
        fallbackColumnId !== null
          ? `list-drop-zone:${fallbackColumnId}`
          : "list-drop-zone",
      )}
    >
      {children}
    </div>
  );
}

function getTaskBoardTaskSurfaceClassName(
  baseClassName: string,
  isDragging: boolean,
  isDraggingByDnd: boolean,
  isOver: boolean,
): string {
  return `${TASK_BOARD_GPU_SURFACE_CLASS_NAME} ${baseClassName} ${isDragging || isDraggingByDnd ? "opacity-60" : ""} ${
    isOver && !isDraggingByDnd ? "ring-1 ring-blue-400 dark:ring-blue-500" : ""
  }`;
}

function getTaskBoardDragHandleClassName(
  baseClassName: string,
  isDisabled: boolean,
): string {
  return `${TASK_BOARD_GPU_SURFACE_CLASS_NAME} ${baseClassName} ${
    isDisabled
      ? "cursor-default opacity-50"
      : "cursor-grab active:cursor-grabbing"
  }`;
}

function applyTaskCompletionUpdate(
  task: TaskBoardTask,
  isCompleted: boolean,
  columns: TaskBoardColumn[],
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void,
) {
  if (isCompleted) {
    const doneColumnId = findDoneColumnId(columns);
    updateTask(task.id, {
      completed: true,
      ...(doneColumnId ? { columnId: doneColumnId } : {}),
    });
    return;
  }
  updateTask(task.id, { completed: false });
}

function TaskBoardTaskDescriptionToggleButton({
  task,
  isDisabled,
  isDescriptionVisible,
  setIsDescriptionVisible,
  updateTask,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  isDescriptionVisible: boolean;
  setIsDescriptionVisible: (nextVisible: boolean) => void;
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void;
}) {
  return (
    <button
      type="button"
      {...getTaskBoardGpuControlProps(`task:${task.id}:description-toggle`)}
      data-testid={`task-board-task-description-toggle-${task.id}`}
      aria-label={
        isDescriptionVisible
          ? "Remove task description"
          : "Add task description"
      }
      className={getTaskBoardControlClassName(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800",
      )}
      disabled={isDisabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (isDescriptionVisible) {
          updateTask(task.id, { description: "" });
          setIsDescriptionVisible(false);
          return;
        }
        setIsDescriptionVisible(true);
      }}
    >
      {isDescriptionVisible ? (
        <MdPlaylistRemove size={12} />
      ) : (
        <MdOutlinePlaylistAdd size={12} />
      )}
    </button>
  );
}

function TaskBoardTaskRemoveButton({
  taskId,
  isDisabled,
  removeTask,
}: {
  taskId: string;
  isDisabled: boolean;
  removeTask: (taskId: string) => void;
}) {
  return (
    <button
      type="button"
      {...getTaskBoardGpuControlProps(`task:${taskId}:remove`)}
      data-testid={`task-board-task-remove-${taskId}`}
      aria-label="Remove task"
      className={getTaskBoardControlClassName(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-red-300 text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30",
      )}
      disabled={isDisabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        removeTask(taskId);
      }}
    >
      <FiTrash2 size={12} />
    </button>
  );
}

function TaskBoardTaskDescriptionInput({
  task,
  isDisabled,
  className,
  updateTask,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  className: string;
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void;
}) {
  return (
    <textarea
      {...getTaskBoardGpuControlProps(`task:${task.id}:description`)}
      key={`${task.id}-${task.description}`}
      data-testid={`task-board-task-description-input-${task.id}`}
      defaultValue={task.description}
      placeholder="Description"
      onBlur={(event) => {
        const nextDescription = event.target.value.trim();
        if (nextDescription !== task.description) {
          updateTask(task.id, { description: nextDescription });
        }
      }}
      disabled={isDisabled}
      className={className}
    />
  );
}

function TaskBoardTaskCardScheduleSummary({
  dueSummary,
  recurrenceSummary,
}: {
  dueSummary: string | null;
  recurrenceSummary: string | null;
}) {
  if (!dueSummary && !recurrenceSummary) {
    return null;
  }
  return (
    <div className="min-w-0 space-y-0.5 text-[11px] text-setta-500 dark:text-setta-400">
      {dueSummary ? (
        <p className="truncate" title={dueSummary}>
          {dueSummary}
        </p>
      ) : null}
      {recurrenceSummary ? (
        <p className="truncate" title={recurrenceSummary}>
          {recurrenceSummary}
        </p>
      ) : null}
    </div>
  );
}

function TaskBoardTaskListRow({
  task,
  fallbackColumnId,
  columns,
  isDisabled,
  isDragging,
  updateTask,
  removeTask,
}: {
  task: TaskBoardTask;
  fallbackColumnId: string | null;
  columns: TaskBoardColumn[];
  isDisabled: boolean;
  isDragging: boolean;
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void;
  removeTask: (taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging: isDraggingByDnd,
    isOver,
  } = useSortable({
    id: toTaskDndId(task.id),
    disabled: isDisabled,
    transition: {
      duration: 30,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    },
    data: {
      type: "task-board-task",
      taskId: task.id,
      columnId: toTaskBoardColumnId(task, fallbackColumnId),
      sortableOrientation: "vertical",
    },
  });
  const scaledTransform = applyZoomToTransform(transform);
  const dndStyle = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDraggingByDnd ? 5 : undefined,
  };
  const dueSummary = formatTaskDueSummary(task.dueDateIso);
  const recurrenceSummary = formatTaskRecurrenceSummary(task);
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(
    task.description.trim() !== "",
  );
  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      {...getTaskBoardGpuControlProps(`task:${task.id}:list-row`)}
      className={getTaskBoardTaskSurfaceClassName(
        "mx-0.5 my-0.5 grid grid-cols-[24px_minmax(0,1fr)_132px] items-center gap-2 rounded-md border border-setta-100 bg-white/95 py-0.5 pl-0.5 pr-1.5 dark:border-setta-800 dark:bg-setta-900/60",
        isDragging,
        isDraggingByDnd,
        isOver,
      )}
      data-task-board-task-id={task.id}
      data-testid="task-board-task-drag-surface"
    >
      <div className="flex items-center justify-start">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...getTaskBoardGpuControlProps(`task:${task.id}:drag-handle`)}
          className={getTaskBoardDragHandleClassName(
            "inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-400 transition focus-visible:border-blue-400 focus-visible:outline-none dark:text-setta-500",
            isDisabled,
          )}
          aria-label="Drag task"
          data-testid="task-board-task-drag-handle"
          disabled={isDisabled}
          {...attributes}
          {...listeners}
        >
          <RxDragHandleDots2 size={14} />
        </button>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            {...getTaskBoardGpuControlProps(`task:${task.id}:done`)}
            checked={task.completed}
            onChange={(event) => {
              applyTaskCompletionUpdate(
                task,
                event.target.checked,
                columns,
                updateTask,
              );
            }}
            disabled={isDisabled}
            aria-label="Mark task done"
            data-testid="task-board-task-list-done-checkbox"
            className={getTaskBoardControlClassName(
              "h-4 w-4 shrink-0 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500 disabled:opacity-50",
            )}
          />
          <input
            type="text"
            {...getTaskBoardGpuControlProps(`task:${task.id}:title`)}
            key={`${task.id}-${task.title}`}
            defaultValue={task.title}
            onBlur={(event) => {
              const nextTitle = event.target.value.trim();
              if (nextTitle !== task.title) {
                updateTask(task.id, { title: nextTitle });
              }
            }}
            disabled={isDisabled}
            className={getTaskBoardControlClassName(
              "w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100",
            )}
          />
          <TaskScheduleMenu
            task={task}
            isDisabled={isDisabled}
            dueSummary={dueSummary}
            recurrenceSummary={recurrenceSummary}
            onChangePatch={(patch) => updateTask(task.id, patch)}
          />
          <TaskBoardTaskDescriptionToggleButton
            task={task}
            isDisabled={isDisabled}
            isDescriptionVisible={isDescriptionVisible}
            setIsDescriptionVisible={setIsDescriptionVisible}
            updateTask={updateTask}
          />
          <TaskBoardTaskRemoveButton
            taskId={task.id}
            isDisabled={isDisabled}
            removeTask={removeTask}
          />
        </div>
        {isDescriptionVisible ? (
          <TaskBoardTaskDescriptionInput
            task={task}
            isDisabled={isDisabled}
            updateTask={updateTask}
            className={getTaskBoardControlClassName(
              "mt-1 min-h-[44px] w-full resize-y rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100",
            )}
          />
        ) : null}
      </div>
      <div>
        <select
          {...getTaskBoardGpuControlProps(`task:${task.id}:column`)}
          value={toTaskBoardColumnId(task, fallbackColumnId) ?? ""}
          onChange={(event) => {
            const nextColumnId = event.target.value;
            updateTask(task.id, {
              columnId: nextColumnId,
              completed: shouldAutoCompleteColumnTask(columns, nextColumnId)
                ? true
                : task.completed,
            });
          }}
          disabled={isDisabled}
          className={getTaskBoardControlClassName(
            "w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100",
          )}
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
function TaskBoardKanbanColumnResizeHandle({
  dividerIndex,
  onMouseDown,
}: {
  dividerIndex: number;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={getTaskBoardControlClassName(
        "relative z-20 flex w-3 shrink-0 items-stretch justify-center",
      )}
      {...getTaskBoardGpuControlProps(`kanban-resize:${dividerIndex}`)}
      data-testid={`task-board-kanban-resize-handle-${dividerIndex}`}
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2">
        <ResizeHandle showResizeHandle={true} onMouseDown={onMouseDown} />
      </div>
    </div>
  );
}
function TaskBoardKanbanLane({
  lane,
  columnWidth,
  isDisabled,
  draggingTaskId,
  updateTask,
  removeTask,
  updateColumn,
  addTask,
}: {
  lane: TaskLane;
  columnWidth: number;
  isDisabled: boolean;
  draggingTaskId: string | null;
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void;
  removeTask: (taskId: string) => void;
  updateColumn: (columnId: string, patch: Partial<TaskBoardColumn>) => void;
  addTask: (columnId?: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: toColumnDndId(lane.column.id),
    data: {
      type: "task-board-column",
      columnId: lane.column.id,
    },
  });
  const laneItems = lane.tasks.map((task) => toTaskDndId(task.id));
  return (
    <article
      ref={setNodeRef}
      className={`${TASK_BOARD_GPU_SURFACE_CLASS_NAME} flex h-full shrink-0 flex-col rounded-md border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/30 ${isOver ? "ring-1 ring-blue-400 dark:ring-blue-500" : ""}`}
      style={{ width: `${columnWidth}px` }}
      {...getTaskBoardGpuControlProps(`column:${lane.column.id}:lane`)}
      data-task-board-column-id={lane.column.id}
    >
      <header className="border-b border-setta-200 px-2 py-2 dark:border-setta-800">
        <div className="flex items-center gap-2">
          <input
            type="color"
            {...getTaskBoardGpuControlProps(`column:${lane.column.id}:color`)}
            value={lane.column.color}
            onChange={(event) =>
              updateColumn(lane.column.id, {
                color: event.target.value,
              })
            }
            disabled={isDisabled}
            className={getTaskBoardControlClassName(
              "h-6 w-8 cursor-pointer rounded border border-setta-200 bg-transparent p-0 disabled:opacity-50 dark:border-setta-700",
            )}
            aria-label="Column color"
          />
          <input
            {...getTaskBoardGpuControlProps(`column:${lane.column.id}:name`)}
            key={`${lane.column.id}-${lane.column.name}`}
            defaultValue={lane.column.name}
            onBlur={(event) => {
              const nextName = event.target.value.trim();
              if (nextName && nextName !== lane.column.name) {
                updateColumn(lane.column.id, { name: nextName });
              }
            }}
            disabled={isDisabled}
            className={getTaskBoardControlClassName(
              "min-w-0 flex-1 rounded border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100",
            )}
          />
        </div>
      </header>
      <SortableContext
        id={`task-board-lane:${lane.column.id}`}
        items={laneItems}
        strategy={verticalListSortingStrategy}
        forceSorting
      >
        <div
          className={getTaskBoardScrollClassName(
            "flex min-h-[140px] flex-1 flex-col gap-2 overflow-auto px-2 py-2",
          )}
          {...getTaskBoardGpuControlProps(`column:${lane.column.id}:tasks`)}
        >
          {lane.tasks.map((task) => (
            <TaskBoardKanbanTaskCard
              key={task.id}
              task={task}
              laneColumnId={lane.column.id}
              isDisabled={isDisabled}
              isDragging={draggingTaskId === task.id}
              updateTask={updateTask}
              removeTask={removeTask}
            />
          ))}
          {lane.tasks.length === 0 ? (
            <p
              className={`rounded border border-dashed px-2 py-3 text-center text-[11px] ${
                isOver
                  ? "border-blue-400 bg-blue-50/70 text-blue-700 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200"
                  : "border-setta-200 text-setta-500 dark:border-setta-800 dark:text-setta-400"
              }`}
            >
              No tasks in this lane.
            </p>
          ) : null}
        </div>
      </SortableContext>
      <div className="border-t border-setta-200 p-2 dark:border-setta-800">
        <button
          type="button"
          {...getTaskBoardGpuControlProps(`column:${lane.column.id}:add-task`)}
          data-testid={`task-board-kanban-add-task-${lane.column.id}`}
          className={getTaskBoardControlClassName(
            "inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800",
          )}
          onClick={() => addTask(lane.column.id)}
          disabled={isDisabled}
        >
          <FiPlus size={12} />
          Task
        </button>
      </div>
    </article>
  );
}
function TaskBoardKanbanTaskCard({
  task,
  laneColumnId,
  isDisabled,
  isDragging,
  updateTask,
  removeTask,
}: {
  task: TaskBoardTask;
  laneColumnId: string;
  isDisabled: boolean;
  isDragging: boolean;
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void;
  removeTask: (taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging: isDraggingByDnd,
    isOver,
  } = useSortable({
    id: toTaskDndId(task.id),
    disabled: isDisabled,
    transition: {
      duration: 30,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    },
    data: {
      type: "task-board-task",
      taskId: task.id,
      columnId: laneColumnId,
      sortableOrientation: "vertical",
    },
  });
  const scaledTransform = applyZoomToTransform(transform);
  const dndStyle = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDraggingByDnd ? 5 : undefined,
  };
  const dueSummary = formatTaskDueSummary(task.dueDateIso);
  const recurrenceSummary = formatTaskRecurrenceSummary(task);
  const cardDueSummary = formatTaskDueCardSummary(task.dueDateIso);
  const cardRecurrenceSummary = formatTaskRecurrenceCardSummary(task);
  const hasCardScheduleSummary =
    cardDueSummary !== null || cardRecurrenceSummary !== null;
  const hasSecondaryContent =
    task.description.trim() !== "" || hasCardScheduleSummary;
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(
    task.description.trim() !== "",
  );
  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      {...getTaskBoardGpuControlProps(`task:${task.id}:kanban-card`)}
      className={getTaskBoardTaskSurfaceClassName(
        "rounded-md border border-setta-200 bg-white py-2 pl-0.5 pr-2 dark:border-setta-700 dark:bg-setta-900",
        isDragging,
        isDraggingByDnd,
        isOver,
      )}
      data-task-board-task-id={task.id}
      data-testid="task-board-task-drag-surface"
    >
      <div
        className={`flex items-center gap-1.5 ${hasSecondaryContent ? "mb-1.5" : ""}`}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...getTaskBoardGpuControlProps(`task:${task.id}:drag-handle`)}
          className={getTaskBoardDragHandleClassName(
            "-ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-setta-400 transition focus-visible:border-blue-400 focus-visible:outline-none dark:text-setta-500",
            isDisabled,
          )}
          aria-label="Drag task"
          data-testid="task-board-task-drag-handle"
          disabled={isDisabled}
          {...attributes}
          {...listeners}
        >
          <RxDragHandleDots2 size={16} />
        </button>
        <input
          type="text"
          {...getTaskBoardGpuControlProps(`task:${task.id}:title`)}
          key={`${task.id}-${task.title}`}
          defaultValue={task.title}
          onBlur={(event) => {
            const nextTitle = event.target.value.trim();
            if (nextTitle !== task.title) {
              updateTask(task.id, { title: nextTitle });
            }
          }}
          disabled={isDisabled}
          className={getTaskBoardControlClassName(
            "min-w-0 flex-1 rounded border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100",
          )}
        />
        <TaskScheduleMenu
          task={task}
          isDisabled={isDisabled}
          dueSummary={dueSummary}
          recurrenceSummary={recurrenceSummary}
          onChangePatch={(patch) => updateTask(task.id, patch)}
        />
        <TaskBoardTaskDescriptionToggleButton
          task={task}
          isDisabled={isDisabled}
          isDescriptionVisible={isDescriptionVisible}
          setIsDescriptionVisible={setIsDescriptionVisible}
          updateTask={updateTask}
        />
        <TaskBoardTaskRemoveButton
          taskId={task.id}
          isDisabled={isDisabled}
          removeTask={removeTask}
        />
      </div>
      {isDescriptionVisible ? (
        <TaskBoardTaskDescriptionInput
          task={task}
          isDisabled={isDisabled}
          updateTask={updateTask}
          className={getTaskBoardControlClassName(
            "mb-1.5 min-h-[52px] w-full resize-y rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100",
          )}
        />
      ) : null}
      <TaskBoardTaskCardScheduleSummary
        dueSummary={cardDueSummary}
        recurrenceSummary={cardRecurrenceSummary}
      />
    </div>
  );
}
function TaskScheduleMenu({
  task,
  isDisabled,
  dueSummary,
  recurrenceSummary,
  onChangePatch,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  dueSummary: string | null;
  recurrenceSummary: string | null;
  onChangePatch: (patch: Partial<TaskBoardTask>) => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          {...getTaskBoardGpuControlProps(`task:${task.id}:schedule-menu`)}
          data-testid={`task-board-task-schedule-menu-${task.id}`}
          aria-label="Task schedule settings"
          className={getTaskBoardControlClassName(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800",
          )}
          disabled={isDisabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <FiCalendar size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...getTaskBoardGpuControlProps(`task:${task.id}:schedule-content`)}
          data-testid={`task-board-task-schedule-content-${task.id}`}
          align="end"
          sideOffset={6}
          className={`${TASK_BOARD_GPU_CONTROL_CLASS_NAME} z-30 flex w-[280px] flex-col gap-2 rounded-md border border-setta-200 bg-white p-2 shadow-xl dark:border-setta-700 dark:bg-setta-900`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Due
            </p>
            <TaskDueInput
              task={task}
              isDisabled={isDisabled}
              onChange={(nextDueDateIso) =>
                onChangePatch({ dueDateIso: nextDueDateIso })
              }
            />
            {dueSummary !== null ? (
              <p className="truncate text-[10px] text-setta-500 dark:text-setta-400">
                {dueSummary}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Repeat
            </p>
            <TaskRecurrenceInput
              task={task}
              isDisabled={isDisabled}
              onChangePatch={onChangePatch}
            />
            {recurrenceSummary !== null ? (
              <p className="truncate text-[10px] text-setta-500 dark:text-setta-400">
                {recurrenceSummary}
              </p>
            ) : null}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
function TaskDueInput({
  task,
  isDisabled,
  onChange,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  onChange: (nextDueDateIso: string) => void;
}) {
  const dueMode = getTaskDueMode(task.dueDateIso);
  const dateValue = resolveTaskDateValue(task.dueDateIso);
  const dateTimeValue = resolveTaskDateTimeValue(task.dueDateIso);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        {...getTaskBoardGpuControlProps(`task:${task.id}:due-mode`)}
        data-testid={`task-board-task-due-mode-${task.id}`}
        value={dueMode}
        onChange={(event) => {
          const nextMode = event.target.value as TaskDueMode;
          if (nextMode === "date_time") {
            const normalizedDate =
              dateValue !== "" ? dateValue : getLocalTodayIsoDate();
            const combined = combineIsoDateAndTimeParts(
              normalizedDate,
              "09:00",
            );
            onChange(combined);
            return;
          }
          onChange(dateValue);
        }}
        disabled={isDisabled}
        className={getTaskBoardControlClassName(
          "w-[88px] shrink-0 rounded border border-setta-200 bg-white px-1 py-1 text-[10px] text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200",
        )}
      >
        <option value="date">Date</option>
        <option value="date_time">Date+Time</option>
      </select>
      <input
        {...getTaskBoardGpuControlProps(`task:${task.id}:due-value`)}
        data-testid={`task-board-task-due-value-${task.id}`}
        type={dueMode === "date_time" ? "datetime-local" : "date"}
        value={dueMode === "date_time" ? dateTimeValue : dateValue}
        onChange={(event) => {
          if (dueMode === "date_time") {
            onChange(normalizeDateTimeToLocalIso(event.target.value));
            return;
          }
          onChange(normalizeDateToIso(event.target.value, "iso"));
        }}
        disabled={isDisabled}
        className={getTaskBoardControlClassName(
          "w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100",
        )}
      />
    </div>
  );
}
function TaskRecurrenceInput({
  task,
  isDisabled,
  onChangePatch,
}: {
  task: TaskBoardTask;
  isDisabled: boolean;
  onChangePatch: (patch: Partial<TaskBoardTask>) => void;
}) {
  const recurrenceMode = task.recurrence;
  const recurrenceDays = getEffectiveRecurrenceDays(task);
  const recurrenceMonths = getEffectiveRecurrenceMonths(task);
  const recurrenceYears = getEffectiveRecurrenceYears(task);
  const recurrenceYearsText = recurrenceYears.join(", ");
  const [recurrenceYearsDraft, setRecurrenceYearsDraft] =
    useState(recurrenceYearsText);
  useEffect(() => {
    setRecurrenceYearsDraft(recurrenceYearsText);
  }, [recurrenceYearsText]);
  const setRecurrenceMode = (nextMode: TaskBoardTaskRecurrence) => {
    onChangePatch({
      recurrence: nextMode,
      recurrenceDays:
        nextMode === TaskBoardTaskRecurrenceEnum.specified_days
          ? recurrenceDays
          : [],
      recurrenceMonths:
        nextMode === TaskBoardTaskRecurrenceEnum.specified_months
          ? recurrenceMonths
          : [],
      recurrenceYears:
        nextMode === TaskBoardTaskRecurrenceEnum.specified_years
          ? recurrenceYears
          : [],
    });
  };
  const commitRecurrenceYears = useCallback(
    (rawValue: string) => {
      const nextYears = parseRecurrenceYears(rawValue);
      const normalizedDraft = nextYears.join(", ");
      setRecurrenceYearsDraft(normalizedDraft);
      if (areNumberArraysEqual(nextYears, recurrenceYears)) {
        return;
      }
      onChangePatch({
        recurrence: TaskBoardTaskRecurrenceEnum.specified_years,
        recurrenceYears: nextYears,
        recurrenceDays: [],
        recurrenceMonths: [],
      });
    },
    [onChangePatch, recurrenceYears],
  );
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <select
        {...getTaskBoardGpuControlProps(`task:${task.id}:recurrence-mode`)}
        data-testid={`task-board-task-recurrence-mode-${task.id}`}
        value={recurrenceMode}
        onChange={(event) =>
          setRecurrenceMode(event.target.value as TaskBoardTaskRecurrence)
        }
        disabled={isDisabled}
        className={getTaskBoardControlClassName(
          "w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100",
        )}
      >
        {TaskBoardUIConfig.recurrenceOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_days ? (
        <TaskRecurrenceChipSelector
          testId={`task-board-task-recurrence-days-${task.id}`}
          options={TaskBoardUIConfig.weekdayOptions}
          values={recurrenceDays}
          disabled={isDisabled}
          onChange={(nextDays) =>
            onChangePatch({
              recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
              recurrenceDays: sortRecurringWeekdays(nextDays),
              recurrenceMonths: [],
              recurrenceYears: [],
            })
          }
        />
      ) : null}

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_months ? (
        <TaskRecurrenceChipSelector
          testId={`task-board-task-recurrence-months-${task.id}`}
          options={TaskBoardUIConfig.monthOptions}
          values={recurrenceMonths}
          disabled={isDisabled}
          onChange={(nextMonths) =>
            onChangePatch({
              recurrence: TaskBoardTaskRecurrenceEnum.specified_months,
              recurrenceMonths: sortRecurringMonths(nextMonths),
              recurrenceDays: [],
              recurrenceYears: [],
            })
          }
        />
      ) : null}

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_years ? (
        <input
          type="text"
          {...getTaskBoardGpuControlProps(`task:${task.id}:recurrence-years`)}
          data-testid={`task-board-task-recurrence-years-${task.id}`}
          value={recurrenceYearsDraft}
          onChange={(event) => {
            setRecurrenceYearsDraft(event.target.value);
          }}
          onBlur={(event) => {
            commitRecurrenceYears(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            event.currentTarget.blur();
          }}
          disabled={isDisabled}
          placeholder="2026, 2027"
          className={getTaskBoardControlClassName(
            "w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100",
          )}
        />
      ) : null}
    </div>
  );
}
function TaskRecurrenceChipSelector<T extends string>({
  testId,
  options,
  values,
  disabled,
  onChange,
}: {
  testId: string;
  options: Array<{
    value: T;
    label: string;
  }>;
  values: T[];
  disabled: boolean;
  onChange: (nextValues: T[]) => void;
}) {
  const selected = new Set(values);
  return (
    <div
      data-testid={testId}
      className={getTaskBoardControlClassName("flex flex-wrap gap-1")}
      {...getTaskBoardGpuControlProps(`recurrence-chip-list:${testId}`)}
    >
      {options.map((option) => {
        const isSelected = selected.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            {...getTaskBoardGpuControlProps(
              `recurrence-chip:${testId}:${option.value}`,
            )}
            disabled={disabled}
            className={getTaskBoardControlClassName(
              `rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                isSelected
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
                  : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              } disabled:opacity-50`,
            )}
            onClick={() => {
              if (selected.has(option.value)) {
                onChange(values.filter((value) => value !== option.value));
                return;
              }
              onChange([...values, option.value]);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
