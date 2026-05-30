import { HiHome } from "react-icons/hi";

import { IoMdCheckmark } from "react-icons/io";

import { IoStar, IoStarOutline } from "react-icons/io5";

import { Link, useNavigate } from "react-router-dom";

import {
  buildSharePath,
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
} from "utils/constants";

import {
  getSelectedProjectDetailsContainerClassName,
  handleProjectListRowKeyDown,
  HomeProject,
  navigateToProjectPath,
  shouldShowSelectedProjectOpenLink,
} from "./workspaceLayout";

export function ProjectListItems({
  projects,
  isFavoriteSection,
  defaultProjectConfigId,
  selectedProjects,
  onSelectProject,
  onToggleProjectSelection,
  inSelectionMode,
  selectionEnabled,
  isDeploymentMode,
  activeProjectId,
  onActivateProject,
  onSetDefaultProject,
  onToggleFavoriteProjectConfig,
}: {
  projects: Array<HomeProject>;
  isFavoriteSection: boolean;
  defaultProjectConfigId: string | null;
  selectedProjects: Array<string>;
  onSelectProject: (id: string) => void;
  onToggleProjectSelection: (id: string) => void;
  inSelectionMode: boolean;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  activeProjectId: string | null;
  onActivateProject: (projectId: string) => void;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <p className="rounded border border-dashed border-setta-200 px-2 py-3 text-xs text-setta-400 dark:border-setta-800 dark:text-setta-500">
        No projects in this section.
      </p>
    );
  }
  return (
    <div
      className="flex min-h-0 flex-col gap-2"
      data-testid="home-project-list"
    >
      {projects.map((project) => (
        <ProjectListItem
          key={project.id}
          project={project}
          isFavorite={isFavoriteSection}
          isDefault={project.id === defaultProjectConfigId}
          isSelected={selectedProjects.includes(project.id)}
          isActive={activeProjectId === project.id}
          onSelectProject={onSelectProject}
          onToggleProjectSelection={onToggleProjectSelection}
          inSelectionMode={inSelectionMode}
          selectionEnabled={selectionEnabled}
          isDeploymentMode={isDeploymentMode}
          onActivate={() => onActivateProject(project.id)}
          onSetDefaultProject={onSetDefaultProject}
          onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
        />
      ))}
    </div>
  );
}

export function ProjectListSelectionButton({
  isSelected,
  onToggleProjectSelection,
  projectId,
}: {
  isSelected: boolean;
  onToggleProjectSelection: (id: string) => void;
  projectId: string;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full !border !border-solid transition-colors ${
        isSelected
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-setta-300/80 bg-transparent text-transparent dark:border-setta-400/90"
      }`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleProjectSelection(projectId);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={isSelected ? "Unselect project" : "Select project"}
    >
      <IoMdCheckmark size={10} />
    </button>
  );
}

export function ProjectListDefaultButton({
  isDefault,
  onSetDefaultProject,
  projectId,
}: {
  isDefault: boolean;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  projectId: string;
}) {
  return (
    <button
      type="button"
      data-testid="home-project-default-toggle"
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-transparent transition-colors focus-visible:ring-2 ${
        isDefault
          ? "text-green-500"
          : "text-transparent hover:!text-setta-400 group-hover/projectitem:text-setta-400/55 dark:hover:!text-setta-300 dark:group-hover/projectitem:text-setta-500"
      }`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void onSetDefaultProject(projectId);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={isDefault ? "Default project" : "Make default project"}
      title={isDefault ? "Default project" : "Make default project"}
    >
      <HiHome size={13} />
    </button>
  );
}

export function ProjectListFavoriteButton({
  isFavorite,
  onToggleFavoriteProjectConfig,
  projectId,
}: {
  isFavorite: boolean;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  projectId: string;
}) {
  return (
    <button
      type="button"
      data-testid="home-project-favorite-toggle"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-setta-400 hover:bg-setta-100 hover:text-amber-500 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-amber-400"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleFavoriteProjectConfig(projectId);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
    >
      {isFavorite ? <IoStar size={13} /> : <IoStarOutline size={13} />}
    </button>
  );
}

export function ProjectListItem({
  project,
  isFavorite,
  isDefault,
  isSelected,
  isActive,
  onSelectProject,
  onToggleProjectSelection,
  inSelectionMode,
  selectionEnabled,
  isDeploymentMode,
  onActivate,
  onSetDefaultProject,
  onToggleFavoriteProjectConfig,
}: {
  project: HomeProject;
  isFavorite: boolean;
  isDefault: boolean;
  isSelected: boolean;
  isActive: boolean;
  onSelectProject: (id: string) => void;
  onToggleProjectSelection: (id: string) => void;
  inSelectionMode: boolean;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  onActivate: () => void;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
}) {
  const navigate = useNavigate();
  const projectPath = resolveProjectPath(project.name, isDeploymentMode);
  const baseClasses =
    "flex w-full items-center gap-2 rounded border px-2 py-2 text-left text-xs transition-colors";
  const activeClasses =
    "border-blue-500/60 bg-blue-50/60 text-blue-700 dark:border-blue-500/70 dark:bg-blue-950/35 dark:text-blue-200";
  const inactiveClasses =
    "border-setta-200 text-setta-700 hover:bg-setta-50 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-850";
  const rowCursorClass = selectionEnabled ? "cursor-default" : "cursor-pointer";
  const openProjectFromRow = () =>
    navigateToProjectPath({ navigate, projectPath });
  function onRowClick(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!selectionEnabled) {
      openProjectFromRow();
      return;
    }
    onSelectProject(project.id);
  }
  return (
    <div
      data-testid="home-project-list-row"
      className={`group/projectitem ${baseClasses} ${isActive ? activeClasses : inactiveClasses} ${rowCursorClass}`}
      onMouseEnter={onActivate}
      onClick={onRowClick}
      onDoubleClick={openProjectFromRow}
      onKeyDown={(event) =>
        handleProjectListRowKeyDown({
          event,
          onOpenProject: openProjectFromRow,
          onSelectProject,
          projectId: project.id,
          selectionEnabled,
        })
      }
      role="button"
      tabIndex={0}
      aria-pressed={inSelectionMode ? isSelected : undefined}
    >
      {selectionEnabled && (
        <ProjectListSelectionButton
          isSelected={isSelected}
          onToggleProjectSelection={onToggleProjectSelection}
          projectId={project.id}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {!isDeploymentMode && (
        <ProjectListDefaultButton
          isDefault={isDefault}
          onSetDefaultProject={onSetDefaultProject}
          projectId={project.id}
        />
      )}
      <ProjectListFavoriteButton
        isFavorite={isFavorite}
        onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
        projectId={project.id}
      />
    </div>
  );
}

export function SelectedProjectDetailsTitle() {
  return (
    <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
      Selected Project
    </h2>
  );
}

export function SelectedProjectOpenLink({
  hideTitle,
  projectPath,
}: {
  hideTitle: boolean;
  projectPath: string;
}) {
  return (
    <Link
      to={projectPath}
      state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
      className={`inline-flex h-8 items-center justify-center rounded-md bg-blue-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:ring-2 ${
        hideTitle ? "mt-2" : "mt-auto"
      }`}
    >
      Open Project
    </Link>
  );
}

export function SelectedProjectDetails({
  project,
  isDefault,
  isDeploymentMode,
  hideTitle = false,
}: {
  project: HomeProject | null;
  isDefault: boolean;
  isDeploymentMode: boolean;
  hideTitle?: boolean;
}) {
  const containerClassName =
    getSelectedProjectDetailsContainerClassName(hideTitle);
  if (!project) {
    return (
      <aside
        className={containerClassName}
        data-testid="home-selected-project-details"
      >
        {!hideTitle && <SelectedProjectDetailsTitle />}
        <p className="text-sm text-setta-500 dark:text-setta-400">
          No project selected.
        </p>
      </aside>
    );
  }
  const projectPath = resolveProjectPath(project.name, isDeploymentMode);
  const topLevelSectionCount = getProjectTopLevelSectionCount(project);
  const showOpenProjectLink = shouldShowSelectedProjectOpenLink({
    isDeploymentMode,
    projectPath,
  });
  return (
    <aside
      className={containerClassName}
      data-testid="home-selected-project-details"
    >
      {!hideTitle && <SelectedProjectDetailsTitle />}
      <div className="space-y-2 text-xs text-setta-600 dark:text-setta-300">
        <p className="truncate text-sm font-semibold text-setta-800 dark:text-setta-100">
          {project.name}
        </p>
        <p>
          Default:{" "}
          <span className="font-semibold">{isDefault ? "Yes" : "No"}</span>
        </p>
        {topLevelSectionCount === null ? null : (
          <p>
            Sections:{" "}
            <span className="font-semibold">{topLevelSectionCount}</span>
          </p>
        )}
        <p className="truncate">
          ID: <span className="font-mono text-[11px]">{project.id}</span>
        </p>
      </div>
      {showOpenProjectLink && projectPath && (
        <SelectedProjectOpenLink
          hideTitle={hideTitle}
          projectPath={projectPath}
        />
      )}
    </aside>
  );
}

export function getProjectTopLevelSectionCount(
  project: Pick<HomeProject, "topLevelSections">,
): number | null {
  if (!project.topLevelSections) {
    return null;
  }
  return Object.keys(project.topLevelSections).length;
}

export function resolveProjectPath(
  projectName: string,
  isDeploymentMode: boolean,
): string | null {
  if (!isDeploymentMode) {
    return pathRelativeToProject(projectName);
  }
  return buildSharePath(projectName);
}
