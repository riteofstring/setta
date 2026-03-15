import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import {
  DragDropProvider,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
  SectionTypeEnum,
  TaskBoardColumn,
  TaskBoardTask,
  TaskBoardViewMode,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import {
  applyTaskBoardMutation,
  buildTaskBoardLanes,
  normalizeTaskBoardState,
  type TaskBoardMutationKind,
  type TaskBoardState,
} from "utils/taskBoard";
import { shallow } from "zustand/shallow";
import { TaskBoardAreaKanbanView } from "./taskBoardAreaKanbanView";
import {
  appendTaskBoardColumn,
  appendTaskBoardTask,
  removeTaskBoardTask,
  reorderTaskBoardTasks,
  resolveSourceTaskIdFromDragEvent,
  resolveTaskBoardDropTarget,
  resolveTaskDropTargetFromDelta,
  TASK_BOARD_KANBAN_COLUMN_DEFAULT_WIDTH,
  TASK_BOARD_KANBAN_COLUMN_MIN_WIDTH,
  TASK_BOARD_NO_DRAG_CLASS_NAME,
  toTaskBoardState,
  updateTaskBoardColumn,
  updateTaskBoardTask,
  type TaskDropPlacement,
  type TaskDropTarget,
} from "./taskBoardAreaModel";
import { TaskBoardTaskListView } from "./taskBoardAreaTaskListView";
import { TaskBoardAreaToolbar } from "./taskBoardAreaToolbar";

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
    (columnId: string, event: ReactMouseEvent<HTMLDivElement>) => {
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
          return route_set_task_board_section_state({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            viewMode: nextStateForSend.viewMode,
            columns: nextStateForSend.columns,
            tasks: nextStateForSend.tasks,
            frontendOpId,
          });
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
      const defaultColumnId =
        columnId ?? normalizedState.columns[0]?.id ?? null;
      if (!defaultColumnId) {
        return;
      }
      setNewTaskTitle("");
      updateState((current) =>
        appendTaskBoardTask(current, {
          title: newTaskTitle,
          columnId: defaultColumnId,
        }),
      );
    },
    [isDisabled, newTaskTitle, normalizedState.columns, updateState],
  );

  const addColumn = useCallback(() => {
    if (isDisabled) {
      return;
    }
    updateState((current) => appendTaskBoardColumn(current));
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
        (current) => updateTaskBoardTask(current, taskId, patch),
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
      updateState((current) => removeTaskBoardTask(current, taskId));
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
      updateState((current) =>
        reorderTaskBoardTasks(current, {
          sourceTaskId,
          targetTaskId,
          targetColumnId,
          targetPlacement,
        }),
      );
    },
    [isDisabled, updateState],
  );

  const updateColumn = useCallback(
    (columnId: string, patch: Partial<TaskBoardColumn>) => {
      if (isDisabled) {
        return;
      }
      updateState(
        (current) => updateTaskBoardColumn(current, columnId, patch),
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
      <TaskBoardAreaToolbar
        viewMode={normalizedState.viewMode}
        newTaskTitle={newTaskTitle}
        isDisabled={isDisabled}
        onNewTaskTitleChange={setNewTaskTitle}
        onAddTask={() => addTask()}
        onAddColumn={addColumn}
        onViewModeChange={setViewMode}
      />

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
          <TaskBoardTaskListView
            sectionId={sectionId}
            tasks={normalizedState.tasks}
            columns={normalizedState.columns}
            fallbackColumnId={fallbackColumnId}
            isDisabled={isDisabled}
            draggingTaskId={draggingTaskId}
            updateTask={updateTask}
            removeTask={removeTask}
          />
        ) : (
          <TaskBoardAreaKanbanView
            lanes={lanes}
            kanbanColumnsContainerRef={kanbanColumnsContainerRef}
            isDisabled={isDisabled}
            draggingTaskId={draggingTaskId}
            getKanbanColumnWidth={getKanbanColumnWidth}
            onResizeStart={handleKanbanColumnResizeStart}
            updateTask={updateTask}
            removeTask={removeTask}
            updateColumn={updateColumn}
            addTask={addTask}
          />
        )}
      </DragDropProvider>
    </div>
  );
}
