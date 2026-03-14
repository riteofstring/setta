import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import { IoMdCheckmark } from "react-icons/io";
import { MdOutlineRadioButtonUnchecked } from "react-icons/md";
import { TodoItem, TodoStatus } from "utils/claudeTools";

const STATUS_LABELS: Record<TodoStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

type TodoListCardProps = {
  todos: TodoItem[];
  summaryOnly: boolean;
};

export function TodoListCard({ todos, summaryOnly }: TodoListCardProps) {
  const counts = countStatuses(todos);
  const summaryText = buildSummary(counts);

  return (
    <div className="my-1 overflow-hidden rounded-md border border-setta-200/70 bg-white shadow-sm dark:border-setta-800 dark:bg-setta-900">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-setta-700 dark:text-setta-200">
            Checklist
          </span>
          <span className="text-[10px] text-setta-400">{summaryText}</span>
        </div>
        <span className="rounded-full bg-setta-100 px-2 py-1 text-[10px] font-semibold text-setta-500 dark:bg-setta-800 dark:text-setta-200">
          {todos.length} items
        </span>
      </div>
      {summaryOnly ? null : (
        <div className="border-t border-setta-100 dark:border-setta-800">
          <ul className="m-0 flex flex-col gap-2 px-3 py-3">
            {todos.map((todo, idx) => (
              <li
                key={`${todo.content}-${idx}`}
                className="flex items-start gap-2 text-xs text-setta-600 dark:text-setta-300"
              >
                <StatusIcon status={todo.status} />
                <div className="flex flex-col gap-1">
                  <span
                    className={
                      todo.status === "completed"
                        ? "text-setta-400 line-through"
                        : "text-setta-700 dark:text-setta-200"
                    }
                  >
                    {todo.content}
                  </span>
                  {todo.activeForm ? (
                    <span className="text-[10px] text-setta-400">
                      {todo.activeForm}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function countStatuses(todos: TodoItem[]) {
  return todos.reduce(
    (acc, todo) => {
      acc.total += 1;
      acc[todo.status] += 1;
      return acc;
    },
    {
      total: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
    },
  );
}

function buildSummary(counts: {
  pending: number;
  in_progress: number;
  completed: number;
}) {
  const parts: string[] = [];
  if (counts.pending > 0) {
    parts.push(`${counts.pending} pending`);
  }
  if (counts.in_progress > 0) {
    parts.push(`${counts.in_progress} in progress`);
  }
  if (counts.completed > 0) {
    parts.push(`${counts.completed} completed`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No tasks";
}

function StatusIcon({ status }: { status: TodoStatus }) {
  if (status === "completed") {
    return <IoMdCheckmark className="mt-0.5 text-emerald-500" />;
  }
  if (status === "in_progress") {
    return (
      <BrailleSpinner
        className={`mt-0.5 ${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} text-amber-500`}
      />
    );
  }
  return <MdOutlineRadioButtonUnchecked className="mt-0.5 text-setta-300" />;
}
