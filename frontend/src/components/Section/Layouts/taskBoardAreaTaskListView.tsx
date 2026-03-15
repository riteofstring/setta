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
import { useMemo, useState, type ReactNode } from "react";
import { FiTrash2 } from "react-icons/fi";
import { MdOutlinePlaylistAdd, MdPlaylistRemove } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import { TaskBoardColumn, TaskBoardTask } from "utils/generatedTypes";
import {
  findDoneColumnId,
  shouldAutoCompleteColumnTask,
  TASK_BOARD_LIST_DROP_ID,
  TASK_BOARD_NO_DRAG_CLASS_NAME,
  toColumnDndId,
  toTaskBoardColumnId,
  toTaskDndId,
} from "./taskBoardAreaModel";
import { TaskScheduleMenu } from "./taskBoardTaskSchedule";
import {
  formatTaskDueSummary,
  formatTaskRecurrenceSummary,
} from "./taskBoardTaskScheduleModel";

export function TaskBoardTaskListView({
  sectionId,
  tasks,
  columns,
  fallbackColumnId,
  isDisabled,
  draggingTaskId,
  updateTask,
  removeTask,
}: {
  sectionId: string;
  tasks: TaskBoardTask[];
  columns: TaskBoardColumn[];
  fallbackColumnId: string | null;
  isDisabled: boolean;
  draggingTaskId: string | null;
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void;
  removeTask: (taskId: string) => void;
}) {
  const taskListItems = useMemo(
    () => tasks.map((task) => toTaskDndId(task.id)),
    [tasks],
  );

  return (
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
          {tasks.map((task) => (
            <TaskBoardTaskListRow
              key={task.id}
              task={task}
              fallbackColumnId={fallbackColumnId}
              columns={columns}
              isDisabled={isDisabled}
              isDragging={draggingTaskId === task.id}
              updateTask={updateTask}
              removeTask={removeTask}
            />
          ))}
        </TaskBoardListDropZone>
      </SortableContext>
      {tasks.length === 0 ? (
        <div className="px-3 py-4 text-xs text-setta-500 dark:text-setta-400">
          No tasks yet. Add your first task above.
        </div>
      ) : null}
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
