import { callOpenAPI, createNewId } from "@setta/app-subsystem-frontend-sdk";

import {
  DragDropProvider,
  SortableContext,
  useDroppable,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";

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

import { FiColumns, FiList, FiPlus, FiTrash2 } from "react-icons/fi";

import { MdOutlinePlaylistAdd, MdPlaylistRemove } from "react-icons/md";

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

import { shallow } from "zustand/shallow";

import {
  applyTaskDropTarget,
  buildReorderedTaskList,
  findDoneColumnId,
  getTaskBoardControlClassName,
  getTaskBoardGpuControlProps,
  getTaskBoardScrollClassName,
  ReorderTaskArgs,
  resolveDragEndDropTarget,
  resolveSourceTaskIdFromDragEvent,
  resolveTaskBoardDropTarget,
  shouldAutoCompleteColumnTask,
  TASK_BOARD_GPU_SURFACE_CLASS_NAME,
  TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH,
  TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH,
  TASK_BOARD_LIST_DROP_ID,
  TaskDropTarget,
  toColumnDndId,
  toTaskBoardState,
  toTaskDndId,
  useTaskBoardSensors,
} from "./taskBoardState";

import {
  TaskBoardKanbanColumnResizeHandle,
  TaskBoardKanbanLane,
  TaskBoardTaskListRow,
} from "./taskBoardRowsAndCards";

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

export function getTaskBoardTaskSurfaceClassName(
  baseClassName: string,
  isDragging: boolean,
  isDraggingByDnd: boolean,
  isOver: boolean,
): string {
  return `${TASK_BOARD_GPU_SURFACE_CLASS_NAME} ${baseClassName} ${isDragging || isDraggingByDnd ? "opacity-60" : ""} ${
    isOver && !isDraggingByDnd ? "ring-1 ring-blue-400 dark:ring-blue-500" : ""
  }`;
}

export function getTaskBoardDragHandleClassName(
  baseClassName: string,
  isDisabled: boolean,
): string {
  return `${TASK_BOARD_GPU_SURFACE_CLASS_NAME} ${baseClassName} ${
    isDisabled
      ? "cursor-default opacity-50"
      : "cursor-grab active:cursor-grabbing"
  }`;
}

export function applyTaskCompletionUpdate(
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

export function TaskBoardTaskDescriptionToggleButton({
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

export function TaskBoardTaskRemoveButton({
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

export function TaskBoardTaskDescriptionInput({
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

export function TaskBoardTaskCardScheduleSummary({
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
