import type { UniqueIdentifier } from "@dnd-kit/abstract";
import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
import { useReactFlow } from "forks/xyflow/core/store";
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
import { route_set_task_board_section_state } from "utils/generatedEndpoints";
import {
  createTaskBoardColumn,
  createTaskBoardTask,
  SectionTypeEnum,
  TaskBoardColumn,
  TaskBoardRecurringMonth,
  TaskBoardRecurringMonthEnum,
  TaskBoardRecurringWeekday,
  TaskBoardRecurringWeekdayEnum,
  TaskBoardTask,
  TaskBoardTaskRecurrence,
  TaskBoardTaskRecurrenceEnum,
  TaskBoardViewMode,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import {
  buildTaskBoardLanes,
  getNextColumnSortIndex,
  getNextTaskSortIndex,
  normalizeTaskBoardState,
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

const TASK_DND_PREFIX = "task-board-task:";
const COLUMN_DND_PREFIX = "task-board-column:";
const TASK_BOARD_LIST_DROP_ID = "task-board-list-drop";
const TASK_BOARD_NO_DRAG_CLASS_NAME = "task-board-no-drag";
const TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH = 240;
const TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH = 180;

const TASK_RECURRENCE_OPTIONS: Array<{
  value: TaskBoardTaskRecurrence;
  label: string;
}> = [
  { value: TaskBoardTaskRecurrenceEnum.none, label: "No repeat" },
  { value: TaskBoardTaskRecurrenceEnum.hourly, label: "Hourly" },
  { value: TaskBoardTaskRecurrenceEnum.daily, label: "Daily" },
  {
    value: TaskBoardTaskRecurrenceEnum.specified_days,
    label: "Repeat specified days",
  },
  {
    value: TaskBoardTaskRecurrenceEnum.specified_months,
    label: "Repeat specified months",
  },
  {
    value: TaskBoardTaskRecurrenceEnum.specified_years,
    label: "Repeat specified years",
  },
];

const WEEKDAY_OPTIONS: Array<{
  value: TaskBoardRecurringWeekday;
  label: string;
}> = [
  { value: TaskBoardRecurringWeekdayEnum.monday, label: "Mon" },
  { value: TaskBoardRecurringWeekdayEnum.tuesday, label: "Tue" },
  { value: TaskBoardRecurringWeekdayEnum.wednesday, label: "Wed" },
  { value: TaskBoardRecurringWeekdayEnum.thursday, label: "Thu" },
  { value: TaskBoardRecurringWeekdayEnum.friday, label: "Fri" },
  { value: TaskBoardRecurringWeekdayEnum.saturday, label: "Sat" },
  { value: TaskBoardRecurringWeekdayEnum.sunday, label: "Sun" },
];

const MONTH_OPTIONS: Array<{
  value: TaskBoardRecurringMonth;
  label: string;
}> = [
  { value: TaskBoardRecurringMonthEnum.january, label: "Jan" },
  { value: TaskBoardRecurringMonthEnum.february, label: "Feb" },
  { value: TaskBoardRecurringMonthEnum.march, label: "Mar" },
  { value: TaskBoardRecurringMonthEnum.april, label: "Apr" },
  { value: TaskBoardRecurringMonthEnum.may, label: "May" },
  { value: TaskBoardRecurringMonthEnum.june, label: "Jun" },
  { value: TaskBoardRecurringMonthEnum.july, label: "Jul" },
  { value: TaskBoardRecurringMonthEnum.august, label: "Aug" },
  { value: TaskBoardRecurringMonthEnum.september, label: "Sep" },
  { value: TaskBoardRecurringMonthEnum.october, label: "Oct" },
  { value: TaskBoardRecurringMonthEnum.november, label: "Nov" },
  { value: TaskBoardRecurringMonthEnum.december, label: "Dec" },
];

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
  const taskId = (data as { taskId?: unknown }).taskId;
  if (typeof taskId !== "string" || taskId.trim() === "") {
    return null;
  }
  return taskId;
}

function getColumnIdFromDndData(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const columnId = (data as { columnId?: unknown }).columnId;
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

function sortEnumValuesByOptionOrder<T extends string>(
  values: T[],
  orderedValues: T[],
): T[] {
  const order = new Map(orderedValues.map((value, index) => [value, index]));
  return [...values].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

function getEffectiveRecurrenceDays(
  task: TaskBoardTask,
): TaskBoardRecurringWeekday[] {
  return sortEnumValuesByOptionOrder(
    task.recurrenceDays,
    WEEKDAY_OPTIONS.map((option) => option.value),
  );
}

function getEffectiveRecurrenceMonths(
  task: TaskBoardTask,
): TaskBoardRecurringMonth[] {
  return sortEnumValuesByOptionOrder(
    task.recurrenceMonths,
    MONTH_OPTIONS.map((option) => option.value),
  );
}

function getEffectiveRecurrenceYears(task: TaskBoardTask): number[] {
  if (task.recurrenceYears.length === 0) {
    return [];
  }
  return [...new Set(task.recurrenceYears)].sort((left, right) => left - right);
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

function formatTaskRecurrenceSummary(task: TaskBoardTask): string | null {
  switch (task.recurrence) {
    case TaskBoardTaskRecurrenceEnum.none:
      return null;
    case TaskBoardTaskRecurrenceEnum.hourly:
      return "Hourly";
    case TaskBoardTaskRecurrenceEnum.daily:
      return "Daily";
    case TaskBoardTaskRecurrenceEnum.specified_days: {
      const days = getEffectiveRecurrenceDays(task);
      if (days.length === 0) {
        return "Repeat specified days";
      }
      return days
        .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day))
        .filter((option): option is (typeof WEEKDAY_OPTIONS)[number] =>
          Boolean(option),
        )
        .map((option) => option.label)
        .join(", ");
    }
    case TaskBoardTaskRecurrenceEnum.specified_months: {
      const months = getEffectiveRecurrenceMonths(task);
      if (months.length === 0) {
        return "Repeat specified months";
      }
      return months
        .map((month) => MONTH_OPTIONS.find((option) => option.value === month))
        .filter((option): option is (typeof MONTH_OPTIONS)[number] =>
          Boolean(option),
        )
        .map((option) => option.label)
        .join(", ");
    }
    case TaskBoardTaskRecurrenceEnum.specified_years: {
      const years = getEffectiveRecurrenceYears(task);
      if (years.length === 0) {
        return "Repeat specified years";
      }
      return years.join(", ");
    }
  }
}

function formatTaskRecurrenceCardSummary(task: TaskBoardTask): string | null {
  const summary = formatTaskRecurrenceSummary(task);
  if (summary === null) {
    return null;
  }
  return `Repeat: ${summary}`;
}

function parseRecurrenceYears(raw: string): number[] {
  if (raw.trim() === "") {
    return [];
  }
  const parsed = raw
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((token) => Number.isInteger(token) && token > 0);
  return [...new Set(parsed)].sort((left, right) => left - right);
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
          const zoom = useReactFlow.getState().transform[2];
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
    (next: TaskBoardState) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
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
        send: (frontendOpId) =>
          route_set_task_board_section_state({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            viewMode: next.viewMode,
            columns: next.columns,
            tasks: next.tasks,
            frontendOpId,
          }),
      });
    },
    [sectionId],
  );

  const updateState = useCallback(
    (mutator: (state: TaskBoardState) => TaskBoardState) => {
      const nextState = normalizeTaskBoardState(mutator(normalizedState));
      persistState(nextState);
    },
    [normalizedState, persistState],
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
      updateState((current) => ({
        ...current,
        viewMode: nextViewMode,
      }));
    },
    [isDisabled, normalizedState.viewMode, updateState],
  );

  const updateTask = useCallback(
    (taskId: string, patch: Partial<TaskBoardTask>) => {
      if (isDisabled) {
        return;
      }
      updateState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId ? { ...task, ...patch } : task,
        ),
      }));
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
    ({
      sourceTaskId,
      targetTaskId,
      targetColumnId,
      targetPlacement,
    }: {
      sourceTaskId: string;
      targetTaskId?: string;
      targetColumnId?: string;
      targetPlacement?: TaskDropPlacement;
    }) => {
      if (isDisabled) {
        return;
      }
      updateState((current) => {
        const sourceIndex = current.tasks.findIndex(
          (task) => task.id === sourceTaskId,
        );
        if (sourceIndex === -1) {
          return current;
        }
        const sourceTask = current.tasks[sourceIndex];
        if (!sourceTask) {
          return current;
        }
        const resolvedTargetColumnId =
          targetColumnId ??
          current.tasks.find((task) => task.id === targetTaskId)?.columnId ??
          sourceTask.columnId ??
          current.columns[0]?.id ??
          null;
        const tasksWithoutSource = current.tasks.filter(
          (task) => task.id !== sourceTaskId,
        );
        let targetIndex = tasksWithoutSource.length;
        if (targetTaskId) {
          const targetIndexWithoutSource = tasksWithoutSource.findIndex(
            (task) => task.id === targetTaskId,
          );
          if (targetIndexWithoutSource >= 0) {
            const placement = targetPlacement ?? "before";
            targetIndex =
              targetIndexWithoutSource + (placement === "after" ? 1 : 0);
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
            current.columns,
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
        const tasksWithUpdatedSortIndex = nextTasks.map((task, index) => ({
          ...task,
          sortIndex: index,
        }));
        return {
          ...current,
          tasks: tasksWithUpdatedSortIndex,
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
      updateState((current) => ({
        ...current,
        columns: current.columns.map((column) =>
          column.id === columnId ? { ...column, ...patch } : column,
        ),
      }));
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

      const dropTargetFromCollision = resolveTaskBoardDropTarget({
        sourceTaskId,
        overId: event.over?.id ?? null,
        overData: event.over?.data?.current,
        collisions: event.collisions,
        tasks: normalizedState.tasks,
        fallbackColumnId,
      });
      const dropTargetFromDelta =
        dropTargetFromCollision === null
          ? resolveTaskDropTargetFromDelta({
              tasks: normalizedState.tasks,
              sourceTaskId,
              fallbackColumnId,
              viewMode: normalizedState.viewMode,
              deltaY: event.delta.y,
              itemHeight: dragTaskHeightRef.current,
            })
          : null;
      const dropTarget =
        dropTargetFromCollision ??
        latestDropTargetRef.current ??
        dropTargetFromDelta;
      dragTaskHeightRef.current = null;
      latestDropTargetRef.current = null;
      if (!dropTarget) {
        return;
      }

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
    },
    [
      draggingTaskId,
      fallbackColumnId,
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
    >
      <div className="mx-1 mt-2 flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="task-board-view-task-list"
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
            normalizedState.viewMode === TaskBoardViewModeEnum.task_list
              ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
              : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          }`}
          onClick={() => setViewMode(TaskBoardViewModeEnum.task_list)}
          disabled={isDisabled}
          aria-label="Task list view"
        >
          <FiList size={14} />
          Task List
        </button>
        <button
          type="button"
          data-testid="task-board-view-kanban"
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
            normalizedState.viewMode === TaskBoardViewModeEnum.kanban
              ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
              : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          }`}
          onClick={() => setViewMode(TaskBoardViewModeEnum.kanban)}
          disabled={isDisabled}
          aria-label="Kanban view"
        >
          <FiColumns size={14} />
          Kanban
        </button>
        <input
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
          className="min-w-0 flex-1 rounded-md border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
        />
        {normalizedState.viewMode === TaskBoardViewModeEnum.task_list ? (
          <button
            type="button"
            data-testid="task-board-add-task"
            className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={() => addTask()}
            disabled={isDisabled}
          >
            <FiPlus size={12} />
            Task
          </button>
        ) : null}
        <button
          type="button"
          data-testid="task-board-add-column"
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
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
          <div className="min-h-0 flex-1 overflow-auto p-1">
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
          <div className="min-h-0 flex-1 overflow-auto p-1">
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
      className={`${isOver ? "bg-blue-50/40 dark:bg-blue-950/30" : ""}`}
    >
      {children}
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
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} mx-0.5 my-0.5 grid grid-cols-[24px_minmax(0,1fr)_132px] items-center gap-2 rounded-md border border-setta-100 bg-white/95 py-0.5 pl-0.5 pr-1.5 dark:border-setta-800 dark:bg-setta-900/60 ${
        isDragging || isDraggingByDnd ? "opacity-60" : ""
      } ${
        isOver && !isDraggingByDnd
          ? "ring-1 ring-blue-400 dark:ring-blue-500"
          : ""
      }`}
      data-task-board-task-id={task.id}
      data-testid="task-board-task-drag-surface"
    >
      <div className="flex items-center justify-start">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={`${NO_DRAG_CLASS_NAME} inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-400 transition focus-visible:border-blue-400 focus-visible:outline-none dark:text-setta-500 ${
            isDisabled
              ? "cursor-default opacity-50"
              : "cursor-grab active:cursor-grabbing"
          }`}
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
            checked={task.completed}
            onChange={(event) => {
              const isCompleted = event.target.checked;
              if (isCompleted) {
                const doneColumnId = findDoneColumnId(columns);
                updateTask(task.id, {
                  completed: true,
                  ...(doneColumnId ? { columnId: doneColumnId } : {}),
                });
                return;
              }
              updateTask(task.id, { completed: false });
            }}
            disabled={isDisabled}
            aria-label="Mark task done"
            data-testid="task-board-task-list-done-checkbox"
            className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} h-4 w-4 shrink-0 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500 disabled:opacity-50`}
          />
          <input
            type="text"
            key={`${task.id}-${task.title}`}
            defaultValue={task.title}
            onBlur={(event) => {
              const nextTitle = event.target.value.trim();
              if (nextTitle !== task.title) {
                updateTask(task.id, { title: nextTitle });
              }
            }}
            disabled={isDisabled}
            className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100`}
          />
          <TaskScheduleMenu
            task={task}
            isDisabled={isDisabled}
            dueSummary={dueSummary}
            recurrenceSummary={recurrenceSummary}
            onChangePatch={(patch) => updateTask(task.id, patch)}
          />
          <button
            type="button"
            data-testid={`task-board-task-description-toggle-${task.id}`}
            aria-label={
              isDescriptionVisible
                ? "Remove task description"
                : "Add task description"
            }
            className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800`}
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
          <button
            type="button"
            data-testid={`task-board-task-remove-${task.id}`}
            aria-label="Remove task"
            className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-red-300 text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30`}
            disabled={isDisabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              removeTask(task.id);
            }}
          >
            <FiTrash2 size={12} />
          </button>
        </div>
        {isDescriptionVisible ? (
          <textarea
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
            className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} mt-1 min-h-[44px] w-full resize-y rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100`}
          />
        ) : null}
      </div>
      <div>
        <select
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
          className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100`}
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
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} relative z-20 flex w-3 shrink-0 items-stretch justify-center`}
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
      className={`flex h-full shrink-0 flex-col rounded-md border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/30 ${
        isOver ? "ring-1 ring-blue-400 dark:ring-blue-500" : ""
      }`}
      style={{ width: `${columnWidth}px` }}
      data-task-board-column-id={lane.column.id}
    >
      <header className="border-b border-setta-200 px-2 py-2 dark:border-setta-800">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={lane.column.color}
            onChange={(event) =>
              updateColumn(lane.column.id, {
                color: event.target.value,
              })
            }
            disabled={isDisabled}
            className="h-6 w-8 cursor-pointer rounded border border-setta-200 bg-transparent p-0 disabled:opacity-50 dark:border-setta-700"
            aria-label="Column color"
          />
          <input
            key={`${lane.column.id}-${lane.column.name}`}
            defaultValue={lane.column.name}
            onBlur={(event) => {
              const nextName = event.target.value.trim();
              if (nextName && nextName !== lane.column.name) {
                updateColumn(lane.column.id, { name: nextName });
              }
            }}
            disabled={isDisabled}
            className="min-w-0 flex-1 rounded border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
          />
        </div>
      </header>
      <SortableContext
        id={`task-board-lane:${lane.column.id}`}
        items={laneItems}
        strategy={verticalListSortingStrategy}
        forceSorting
      >
        <div className="flex min-h-[140px] flex-1 flex-col gap-2 overflow-auto px-2 py-2">
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
          data-testid={`task-board-kanban-add-task-${lane.column.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
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
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} rounded-md border border-setta-200 bg-white py-2 pl-0.5 pr-2 dark:border-setta-700 dark:bg-setta-900 ${
        isDragging || isDraggingByDnd ? "opacity-60" : ""
      } ${
        isOver && !isDraggingByDnd
          ? "ring-1 ring-blue-400 dark:ring-blue-500"
          : ""
      }`}
      data-task-board-task-id={task.id}
      data-testid="task-board-task-drag-surface"
    >
      <div
        className={`flex items-center gap-1.5 ${hasSecondaryContent ? "mb-1.5" : ""}`}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={`${NO_DRAG_CLASS_NAME} -ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-setta-400 transition focus-visible:border-blue-400 focus-visible:outline-none dark:text-setta-500 ${
            isDisabled
              ? "cursor-default opacity-50"
              : "cursor-grab active:cursor-grabbing"
          }`}
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
          key={`${task.id}-${task.title}`}
          defaultValue={task.title}
          onBlur={(event) => {
            const nextTitle = event.target.value.trim();
            if (nextTitle !== task.title) {
              updateTask(task.id, { title: nextTitle });
            }
          }}
          disabled={isDisabled}
          className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} min-w-0 flex-1 rounded border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100`}
        />
        <TaskScheduleMenu
          task={task}
          isDisabled={isDisabled}
          dueSummary={dueSummary}
          recurrenceSummary={recurrenceSummary}
          onChangePatch={(patch) => updateTask(task.id, patch)}
        />
        <button
          type="button"
          data-testid={`task-board-task-description-toggle-${task.id}`}
          aria-label={
            isDescriptionVisible
              ? "Remove task description"
              : "Add task description"
          }
          className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800`}
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
        <button
          type="button"
          data-testid={`task-board-task-remove-${task.id}`}
          aria-label="Remove task"
          className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-red-300 text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30`}
          disabled={isDisabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            removeTask(task.id);
          }}
        >
          <FiTrash2 size={12} />
        </button>
      </div>
      {isDescriptionVisible ? (
        <textarea
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
          className={`${NO_DRAG_CLASS_NAME} ${TASK_BOARD_NO_DRAG_CLASS_NAME} mb-1.5 min-h-[52px] w-full resize-y rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100`}
        />
      ) : null}
      {hasCardScheduleSummary ? (
        <div className="min-w-0 space-y-0.5 text-[11px] text-setta-500 dark:text-setta-400">
          {cardDueSummary ? (
            <p className="truncate" title={cardDueSummary}>
              {cardDueSummary}
            </p>
          ) : null}
          {cardRecurrenceSummary ? (
            <p className="truncate" title={cardRecurrenceSummary}>
              {cardRecurrenceSummary}
            </p>
          ) : null}
        </div>
      ) : null}
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
          data-testid={`task-board-task-schedule-menu-${task.id}`}
          aria-label="Task schedule settings"
          className={`nodrag nopan ${TASK_BOARD_NO_DRAG_CLASS_NAME} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800`}
          disabled={isDisabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <FiCalendar size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-testid={`task-board-task-schedule-content-${task.id}`}
          align="end"
          sideOffset={6}
          className={`z-30 flex w-[280px] flex-col gap-2 rounded-md border border-setta-200 bg-white p-2 shadow-xl dark:border-setta-700 dark:bg-setta-900 ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
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
        className="w-[88px] shrink-0 rounded border border-setta-200 bg-white px-1 py-1 text-[10px] text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
      >
        <option value="date">Date</option>
        <option value="date_time">Date+Time</option>
      </select>
      <input
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
        className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
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

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <select
        data-testid={`task-board-task-recurrence-mode-${task.id}`}
        value={recurrenceMode}
        onChange={(event) =>
          setRecurrenceMode(event.target.value as TaskBoardTaskRecurrence)
        }
        disabled={isDisabled}
        className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
      >
        {TASK_RECURRENCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_days ? (
        <TaskRecurrenceChipSelector
          testId={`task-board-task-recurrence-days-${task.id}`}
          options={WEEKDAY_OPTIONS}
          values={recurrenceDays}
          disabled={isDisabled}
          onChange={(nextDays) =>
            onChangePatch({
              recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
              recurrenceDays: sortEnumValuesByOptionOrder(
                nextDays,
                WEEKDAY_OPTIONS.map((option) => option.value),
              ),
              recurrenceMonths: [],
              recurrenceYears: [],
            })
          }
        />
      ) : null}

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_months ? (
        <TaskRecurrenceChipSelector
          testId={`task-board-task-recurrence-months-${task.id}`}
          options={MONTH_OPTIONS}
          values={recurrenceMonths}
          disabled={isDisabled}
          onChange={(nextMonths) =>
            onChangePatch({
              recurrence: TaskBoardTaskRecurrenceEnum.specified_months,
              recurrenceMonths: sortEnumValuesByOptionOrder(
                nextMonths,
                MONTH_OPTIONS.map((option) => option.value),
              ),
              recurrenceDays: [],
              recurrenceYears: [],
            })
          }
        />
      ) : null}

      {recurrenceMode === TaskBoardTaskRecurrenceEnum.specified_years ? (
        <input
          type="text"
          data-testid={`task-board-task-recurrence-years-${task.id}`}
          value={recurrenceYears.join(", ")}
          onChange={(event) =>
            onChangePatch({
              recurrence: TaskBoardTaskRecurrenceEnum.specified_years,
              recurrenceYears: parseRecurrenceYears(event.target.value),
              recurrenceDays: [],
              recurrenceMonths: [],
            })
          }
          disabled={isDisabled}
          placeholder="2026, 2027"
          className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
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
  options: Array<{ value: T; label: string }>;
  values: T[];
  disabled: boolean;
  onChange: (nextValues: T[]) => void;
}) {
  const selected = new Set(values);
  return (
    <div data-testid={testId} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const isSelected = selected.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            className={`nodrag nopan rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
              isSelected
                ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
                : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            } disabled:opacity-50`}
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
