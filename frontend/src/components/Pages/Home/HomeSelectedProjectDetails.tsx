import { Link } from "react-router-dom";
import {
  buildSharePath,
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
} from "utils/constants";
import { type ProjectConfig } from "utils/generatedTypes";

export function HomeSelectedProjectDetails({
  project,
  isDefault,
  isDeploymentMode,
  hideTitle = false,
}: {
  project: ProjectConfig | null;
  isDefault: boolean;
  isDeploymentMode: boolean;
  hideTitle?: boolean;
}) {
  const containerClassName = hideTitle
    ? "setta-pane-scroll flex h-full min-h-0 flex-col gap-2 text-xs text-setta-600 dark:text-setta-300"
    : "flex h-full min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40";

  if (!project) {
    return (
      <aside
        className={containerClassName}
        data-testid="home-selected-project-details"
      >
        {!hideTitle && (
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
            Selected Project
          </h2>
        )}
        <p className="text-sm text-setta-500 dark:text-setta-400">
          No project selected.
        </p>
      </aside>
    );
  }

  const projectPath = resolveHomeProjectPath(project.name, isDeploymentMode);

  return (
    <aside
      className={containerClassName}
      data-testid="home-selected-project-details"
    >
      {!hideTitle && (
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
          Selected Project
        </h2>
      )}
      <div className="space-y-2 text-xs text-setta-600 dark:text-setta-300">
        <p className="truncate text-sm font-semibold text-setta-800 dark:text-setta-100">
          {project.name}
        </p>
        <p>
          Default:{" "}
          <span className="font-semibold">{isDefault ? "Yes" : "No"}</span>
        </p>
        <p>
          Sections:{" "}
          <span className="font-semibold">
            {getHomeProjectTopLevelSectionCount(project)}
          </span>
        </p>
        <p className="truncate">
          ID: <span className="font-mono text-[11px]">{project.id}</span>
        </p>
      </div>
      {projectPath && !isDeploymentMode && (
        <Link
          to={projectPath}
          state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
          className={`inline-flex h-8 items-center justify-center rounded-md bg-blue-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:ring-2 ${
            hideTitle ? "mt-2" : "mt-auto"
          }`}
        >
          Open Project
        </Link>
      )}
    </aside>
  );
}

export function getHomeProjectTopLevelSectionCount(
  project: ProjectConfig,
): number {
  return Object.keys(project.topLevelSections).length;
}

function resolveHomeProjectPath(
  projectName: string,
  isDeploymentMode: boolean,
): string | null {
  if (!isDeploymentMode) {
    return pathRelativeToProject(projectName);
  }
  return buildSharePath(projectName);
}
