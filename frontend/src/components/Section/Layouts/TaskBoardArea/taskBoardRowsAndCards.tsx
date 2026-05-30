import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { ResizeHandle } from "components/Params/ResizeHandle";

import {
  SortableContext,
  useDroppable,
  useSortable,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";

import {
  applyZoomToTransform,
  transformToString,
} from "forks/dnd-kit/adapter/zoom";

import { useCallback, useEffect, useState } from "react";

import { FiCalendar, FiPlus } from "react-icons/fi";

import { RxDragHandleDots2 } from "react-icons/rx";

import {
  TaskBoardColumn,
  TaskBoardTask,
  TaskBoardTaskRecurrence,
  TaskBoardTaskRecurrenceEnum,
  TaskBoardUIConfig,
} from "utils/generatedTypes";

import {
  combineIsoDateAndTimeParts,
  getLocalTodayIsoDate,
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
} from "utils/textParamDateTime";

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
} from "../taskBoardRecurrence";

import {
  TASK_BOARD_GPU_CONTROL_CLASS_NAME,
  TASK_BOARD_GPU_SURFACE_CLASS_NAME,
  TaskDueMode,
  TaskLane,
  formatTaskDueCardSummary,
  formatTaskDueSummary,
  getTaskBoardControlClassName,
  getTaskBoardGpuControlProps,
  getTaskBoardScrollClassName,
  getTaskDueMode,
  resolveTaskDateTimeValue,
  resolveTaskDateValue,
  shouldAutoCompleteColumnTask,
  toColumnDndId,
  toTaskBoardColumnId,
  toTaskDndId,
} from "./taskBoardState";

import {
  TaskBoardTaskCardScheduleSummary,
  TaskBoardTaskDescriptionInput,
  TaskBoardTaskDescriptionToggleButton,
  TaskBoardTaskRemoveButton,
  applyTaskCompletionUpdate,
  getTaskBoardDragHandleClassName,
  getTaskBoardTaskSurfaceClassName,
} from "./taskBoardArea";

export function TaskBoardTaskListRow({
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

export function TaskBoardKanbanColumnResizeHandle({
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

export function TaskBoardKanbanLane({
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

export function TaskBoardKanbanTaskCard({
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

export function TaskScheduleMenu({
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

export function TaskDueInput({
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

export function TaskRecurrenceInput({
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

export function TaskRecurrenceChipSelector<T extends string>({
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
