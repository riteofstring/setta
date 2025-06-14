import {
  TrashIcon,
  ExternalLinkIcon,
  CheckCircledIcon,
  CrossCircledIcon,
} from "@radix-ui/react-icons";
import { getStatusColor, isValidProjectUrl, formatDate } from "./utils";

export default function ProjectCard({
  project,
  progress,
  onDelete,
  isDeleting,
}) {
  const handleClick = () => {
    if (!isValidProjectUrl(project.url)) return;
    window.open(project.url, "_blank");
  };

  const getStatusIcon = (status) => {
    if (status === "running") return <CheckCircledIcon className="h-4 w-4" />;
    if (status === "error") return <CrossCircledIcon className="h-4 w-4" />;
    return null;
  };

  return (
    <li className="px-6 py-4 hover:bg-setta-50 dark:hover:bg-setta-850 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 cursor-pointer" onClick={handleClick}>
          <p className="font-medium text-setta-800 dark:text-setta-100">
            {project.name}
          </p>
          <p className="text-xs text-setta-500 dark:text-setta-400 hover:text-setta-600 dark:hover:text-setta-300 flex items-center gap-1">
            {project.url}
            {isValidProjectUrl(project.url) && (
              <ExternalLinkIcon className="h-3 w-3" />
            )}
          </p>
          <p className="text-xs text-setta-400 dark:text-setta-500 mt-1">
            Created: {formatDate(project.created_at)}
          </p>

          {progress && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-setta-600 dark:text-setta-400 mb-1">
                <span>{progress.message}</span>
                <span>{progress.percent_complete}%</span>
              </div>
              <div className="w-full bg-setta-200 dark:bg-setta-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress.percent_complete}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(
              project.status,
            )}`}
          >
            {getStatusIcon(project.status)}
            {project.status}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
            disabled={isDeleting}
            className="inline-flex items-center rounded-full p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete project"
          >
            <TrashIcon
              className={`h-4 w-4 ${isDeleting ? "animate-pulse" : ""}`}
            />
          </button>
        </div>
      </div>
    </li>
  );
}
