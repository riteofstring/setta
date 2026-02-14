import _ from "lodash";
import { useCallback, useMemo, useState } from "react";
import { FiColumns, FiList, FiPlus } from "react-icons/fi";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_task_board_section_state } from "utils/generatedEndpoints";
import {
  createTaskBoardColumn,
  createTaskBoardTask,
  SectionTypeEnum,
  TaskBoardColumn,
  TaskBoardTask,
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
  }, _.isEqual);

  const isDisabled = isFrozen || !canEditLayout;
  const normalizedState = useMemo(
    () => normalizeTaskBoardState(toTaskBoardState({ viewMode, columns, tasks })),
    [viewMode, columns, tasks],
  );
  const lanes = useMemo(() => buildTaskBoardLanes(normalizedState), [normalizedState]);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const persistState = useCallback(
    (next: TaskBoardState) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"TaskBoardSection">(state, sectionId, {
            viewMode: next.viewMode,
            columns: next.columns,
            tasks: next.tasks,
          });
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
      const defaultColumnId = columnId ?? normalizedState.columns[0]?.id ?? null;
      if (!defaultColumnId) {
        return;
      }
      const task = createTaskBoardTask({
        title: title.length > 0 ? title : "New Task",
        columnId: defaultColumnId,
        completed: false,
        sortIndex: getNextTaskSortIndex(normalizedState.tasks),
      });
      setNewTaskTitle("");
      updateState((current) => ({
        ...current,
        tasks: [...current.tasks, task],
      }));
    },
    [isDisabled, newTaskTitle, normalizedState.columns, normalizedState.tasks, updateState],
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

  return (
    <div className="section-main section-main-full-w mx-1 mb-2 mt-1 flex min-w-[320px] flex-col gap-3 rounded-lg border border-setta-200/70 bg-white/70 p-3 dark:border-setta-800/70 dark:bg-setta-950/40">
      <div className="flex flex-wrap items-center gap-2">
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

      {normalizedState.viewMode === TaskBoardViewModeEnum.task_list ? (
        <div className="min-h-0 overflow-auto rounded-md border border-setta-200 dark:border-setta-800">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-setta-50 text-setta-500 dark:bg-setta-900/50 dark:text-setta-400">
              <tr>
                <th className="px-2 py-2">Done</th>
                <th className="px-2 py-2">Task</th>
                <th className="px-2 py-2">Column</th>
                <th className="px-2 py-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {normalizedState.tasks.map((task) => (
                <tr
                  key={task.id}
                  className="border-t border-setta-100 dark:border-setta-800"
                  data-task-board-task-id={task.id}
                >
                  <td className="px-2 py-1 align-middle">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={(event) =>
                        updateTask(task.id, { completed: event.target.checked })
                      }
                      disabled={isDisabled}
                    />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <input
                      key={`${task.id}-${task.title}`}
                      defaultValue={task.title}
                      onBlur={(event) => {
                        const nextTitle = event.target.value.trim();
                        if (nextTitle !== task.title) {
                          updateTask(task.id, { title: nextTitle });
                        }
                      }}
                      disabled={isDisabled}
                      className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                    />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <select
                      value={task.columnId ?? normalizedState.columns[0].id}
                      onChange={(event) =>
                        updateTask(task.id, { columnId: event.target.value })
                      }
                      disabled={isDisabled}
                      className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                    >
                      {normalizedState.columns.map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <input
                      type="date"
                      value={task.dueDateIso}
                      onChange={(event) =>
                        updateTask(task.id, { dueDateIso: event.target.value })
                      }
                      disabled={isDisabled}
                      className="w-full rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {normalizedState.tasks.length === 0 ? (
            <div className="px-3 py-4 text-xs text-setta-500 dark:text-setta-400">
              No tasks yet. Add your first task above.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 overflow-auto">
          <div className="flex min-w-fit gap-3 pb-1">
            {lanes.map((lane) => (
              <article
                key={lane.column.id}
                className="flex w-[240px] shrink-0 flex-col rounded-md border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/30"
                data-task-board-column-id={lane.column.id}
              >
                <header className="border-b border-setta-200 px-2 py-2 dark:border-setta-800">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={lane.column.color}
                      onChange={(event) =>
                        updateColumn(lane.column.id, { color: event.target.value })
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
                <div className="flex min-h-[140px] flex-1 flex-col gap-2 overflow-auto px-2 py-2">
                  {lane.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-md border border-setta-200 bg-white px-2 py-2 dark:border-setta-700 dark:bg-setta-900"
                      data-task-board-task-id={task.id}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(event) =>
                            updateTask(task.id, { completed: event.target.checked })
                          }
                          disabled={isDisabled}
                        />
                        <input
                          key={`${task.id}-${task.title}`}
                          defaultValue={task.title}
                          onBlur={(event) => {
                            const nextTitle = event.target.value.trim();
                            if (nextTitle !== task.title) {
                              updateTask(task.id, { title: nextTitle });
                            }
                          }}
                          disabled={isDisabled}
                          className="min-w-0 flex-1 rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-setta-500 dark:text-setta-400">
                        <span>Due</span>
                        <input
                          type="date"
                          value={task.dueDateIso}
                          onChange={(event) =>
                            updateTask(task.id, { dueDateIso: event.target.value })
                          }
                          disabled={isDisabled}
                          className="min-w-0 flex-1 rounded border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
                        />
                      </div>
                    </div>
                  ))}
                  {lane.tasks.length === 0 ? (
                    <p className="rounded border border-dashed border-setta-200 px-2 py-3 text-center text-[11px] text-setta-500 dark:border-setta-800 dark:text-setta-400">
                      No tasks in this lane.
                    </p>
                  ) : null}
                </div>
                <div className="border-t border-setta-200 p-2 dark:border-setta-800">
                  <button
                    type="button"
                    className="w-full rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                    onClick={() => addTask(lane.column.id)}
                    disabled={isDisabled}
                  >
                    Add task
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
