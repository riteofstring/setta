import { FiColumns, FiList, FiPlus } from "react-icons/fi";
import { TaskBoardViewMode, TaskBoardViewModeEnum } from "utils/generatedTypes";

export function TaskBoardAreaToolbar({
  viewMode,
  newTaskTitle,
  isDisabled,
  onNewTaskTitleChange,
  onAddTask,
  onAddColumn,
  onViewModeChange,
}: {
  viewMode: TaskBoardViewMode;
  newTaskTitle: string;
  isDisabled: boolean;
  onNewTaskTitleChange: (value: string) => void;
  onAddTask: () => void;
  onAddColumn: () => void;
  onViewModeChange: (viewMode: TaskBoardViewMode) => void;
}) {
  return (
    <div className="mx-1 mt-2 flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="task-board-view-task-list"
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
          viewMode === TaskBoardViewModeEnum.task_list
            ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
            : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
        }`}
        onClick={() => onViewModeChange(TaskBoardViewModeEnum.task_list)}
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
          viewMode === TaskBoardViewModeEnum.kanban
            ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
            : "border-setta-300 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
        }`}
        onClick={() => onViewModeChange(TaskBoardViewModeEnum.kanban)}
        disabled={isDisabled}
        aria-label="Kanban view"
      >
        <FiColumns size={14} />
        Kanban
      </button>
      <input
        value={newTaskTitle}
        onChange={(event) => onNewTaskTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onAddTask();
          }
        }}
        disabled={isDisabled}
        placeholder="Add task title"
        className="min-w-0 flex-1 rounded-md border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
      />
      {viewMode === TaskBoardViewModeEnum.task_list ? (
        <button
          type="button"
          data-testid="task-board-add-task"
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={onAddTask}
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
        onClick={onAddColumn}
        disabled={isDisabled}
      >
        <FiPlus size={12} />
        Column
      </button>
    </div>
  );
}
