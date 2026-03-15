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
import {
  Fragment,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { MdOutlinePlaylistAdd, MdPlaylistRemove } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import { TaskBoardColumn, TaskBoardTask } from "utils/generatedTypes";
import {
  TASK_BOARD_NO_DRAG_CLASS_NAME,
  TaskLane,
  toColumnDndId,
  toTaskDndId,
} from "./taskBoardAreaModel";
import { TaskScheduleMenu } from "./taskBoardTaskSchedule";
import {
  formatTaskDueCardSummary,
  formatTaskDueSummary,
  formatTaskRecurrenceCardSummary,
  formatTaskRecurrenceSummary,
} from "./taskBoardTaskScheduleModel";

export function TaskBoardAreaKanbanView({
  lanes,
  kanbanColumnsContainerRef,
  isDisabled,
  draggingTaskId,
  getKanbanColumnWidth,
  onResizeStart,
  updateTask,
  removeTask,
  updateColumn,
  addTask,
}: {
  lanes: TaskLane[];
  kanbanColumnsContainerRef: RefObject<HTMLDivElement | null>;
  isDisabled: boolean;
  draggingTaskId: string | null;
  getKanbanColumnWidth: (columnId: string) => number;
  onResizeStart: (
    columnId: string,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => void;
  updateTask: (taskId: string, patch: Partial<TaskBoardTask>) => void;
  removeTask: (taskId: string) => void;
  updateColumn: (columnId: string, patch: Partial<TaskBoardColumn>) => void;
  addTask: (columnId?: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-1">
      <div
        ref={kanbanColumnsContainerRef}
        className="flex h-full min-w-fit items-stretch"
      >
        {lanes.map((lane, laneIndex) => {
          const leftLane = lanes[laneIndex - 1];
          return (
            <Fragment key={lane.column.id}>
              {laneIndex > 0 && !isDisabled && leftLane ? (
                <TaskBoardKanbanColumnResizeHandle
                  dividerIndex={laneIndex - 1}
                  onMouseDown={(event) =>
                    onResizeStart(leftLane.column.id, event)
                  }
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
          );
        })}
      </div>
    </div>
  );
}

function TaskBoardKanbanColumnResizeHandle({
  dividerIndex,
  onMouseDown,
}: {
  dividerIndex: number;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
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
