import {
  ExternalLinkIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  PauseIcon,
  PlayIcon,
  DotFilledIcon,
} from "@radix-ui/react-icons";
import { getStatusColor, isValidProjectUrl, formatDate } from "./utils";

export default function ProjectCard({
  project,
  progress,
  isSelected,
  onToggleSelect,
  onToggleMachineState,
  isTogglingState,
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

  const getStatusIndicator = () => {
    // Show a subtle dot indicator for running projects
    if (project.status === "running" && project.machine_state === "started") {
      return (
        <DotFilledIcon className="h-4 w-4 text-green-500 dark:text-green-400" />
      );
    }
    if (project.status === "running" && project.machine_state === "stopped") {
      return (
        <DotFilledIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
      );
    }
    if (project.status === "error") {
      return (
        <DotFilledIcon className="h-4 w-4 text-red-500 dark:text-red-400" />
      );
    }
    if (project.status === "deploying" || project.status === "creating") {
      return (
        <DotFilledIcon className="h-4 w-4 text-yellow-500 dark:text-yellow-400 animate-pulse" />
      );
    }
    return null;
  };

  const getMachineStateButton = () => {
    // Only show button for running projects with machine ID
    if (project.status !== "running" || !project.machine_id) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(
            project.status,
          )}`}
        >
          {getStatusIcon(project.status)}
          {project.status}
        </span>
      );
    }

    const isHibernating = project.machine_state === "stopped";
    const buttonText = isHibernating ? "Resume" : "Hibernate";
    const icon = isHibernating ? (
      <PlayIcon className="h-3 w-3" />
    ) : (
      <PauseIcon className="h-3 w-3" />
    );
    const buttonColor = isHibernating
      ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
      : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:hover:bg-yellow-800";

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleMachineState(project.id, isHibernating ? "start" : "stop");
        }}
        disabled={isTogglingState}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${buttonColor} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {icon}
        {isTogglingState ? "..." : buttonText}
      </button>
    );
  };

  return (
    <li className="flex items-center gap-4 px-6 py-4 hover:bg-setta-50 dark:hover:bg-setta-850 transition-colors">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation();
          onToggleSelect(project.id);
        }}
        className="h-4 w-4 rounded border-setta-300 text-setta-600 focus:ring-setta-500 dark:border-setta-600 dark:bg-setta-800"
      />

      <div className="flex-1 cursor-pointer" onClick={handleClick}>
        <div className="flex items-center gap-2">
          {getStatusIndicator()}
          <p className="font-medium text-setta-800 dark:text-setta-100">
            {project.name}
          </p>
        </div>

        <p className="text-xs text-setta-500 dark:text-setta-400 hover:text-setta-600 dark:hover:text-setta-300 flex items-center gap-1 mt-1">
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

      <div className="flex items-center">{getMachineStateButton()}</div>
    </li>
  );
}
