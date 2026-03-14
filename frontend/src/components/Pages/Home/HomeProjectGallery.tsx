import { HomePageSearchBar } from "components/AppHeader/SearchBar/HomePageSearch";
import { ProjectConfigThumbnailSurface } from "components/ProjectConfigs/ProjectConfigThumbnailSurface";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { FiGrid, FiList } from "react-icons/fi";
import { HiHome } from "react-icons/hi";
import { IoMdCheckmark } from "react-icons/io";
import { IoStar, IoStarOutline } from "react-icons/io5";
import { LuPenLine } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { setHomeProjectGalleryViewMode } from "state/actions/localStorage";
import {
  PAGE_LOAD_TYPES,
  buildSharePath,
  pathRelativeToProject,
} from "utils/constants";
import { type ProjectConfig } from "utils/generatedTypes";
import {
  getHomeProjectConfigsSectionTitle,
  shouldOpenProjectOnListRowSpace,
} from "./homeWorkspaceState";

const HOME_GALLERY_SEARCH_BAR_CLASS_NAME =
  "mx-auto w-[calc(100%_-_1.5rem)] max-w-sm px-1.5";
const HOME_PROJECT_CARD_GRID_TEMPLATE_COLUMNS =
  "repeat(auto-fill, minmax(10.5rem, 14rem))";

export function HomeProjectGallery({
  favoriteProjects,
  nonFavoriteProjects,
  totalProjectsCount,
  defaultProjectConfigId,
  selectedProjects,
  onSelectProject,
  onToggleProjectSelection,
  selectionEnabled,
  isDeploymentMode,
  activeProjectId,
  onActivateProject,
  onSetDefaultProject,
  onToggleFavoriteProjectConfig,
  galleryViewMode,
  fullScreenSurface = false,
}: {
  favoriteProjects: Array<ProjectConfig>;
  nonFavoriteProjects: Array<ProjectConfig>;
  totalProjectsCount: number;
  defaultProjectConfigId: string | null;
  selectedProjects: Array<string>;
  onSelectProject: (id: string) => void;
  onToggleProjectSelection: (id: string) => void;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  activeProjectId: string | null;
  onActivateProject: (projectId: string) => void;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  galleryViewMode: "thumbnails" | "list";
  fullScreenSurface?: boolean;
}) {
  const gallerySurfaceClassName = fullScreenSurface
    ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    : "flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-3 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40";
  const galleryHeaderClassName = fullScreenSurface
    ? "flex items-center justify-between gap-2 border-b border-setta-200/80 bg-setta-50/80 px-3 py-2 dark:border-setta-800/80 dark:bg-setta-900/40"
    : "mb-2 flex items-center justify-between gap-2";
  const galleryBodyClassName = fullScreenSurface
    ? "setta-pane-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto !px-3 py-2"
    : "min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1";

  if (totalProjectsCount === 0) {
    return (
      <section
        className={gallerySurfaceClassName}
        data-testid="home-project-gallery"
      >
        <div className="grid flex-1 place-items-center">
          <div className="text-center">
            <LuPenLine className="mx-auto h-16 w-16 text-setta-300 dark:text-setta-600/70" />
            <p className="text-sm font-semibold text-setta-500 dark:text-setta-300">
              Create a New Project!
            </p>
          </div>
        </div>
      </section>
    );
  }

  const inSelectionMode = selectionEnabled && selectedProjects.length > 0;

  return (
    <section
      className={gallerySurfaceClassName}
      data-testid="home-project-gallery"
    >
      <div className={galleryHeaderClassName}>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
          Projects
        </h2>
        <div className="flex min-w-0 flex-1 justify-center">
          <HomePageSearchBar className={HOME_GALLERY_SEARCH_BAR_CLASS_NAME} />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="home-project-view-thumbnails"
            className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
              galleryViewMode === "thumbnails"
                ? "border-blue-500/60 bg-blue-100 text-blue-700 dark:border-blue-500/70 dark:bg-blue-950/40 dark:text-blue-200"
                : "border-setta-200 text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            }`}
            aria-label="Show thumbnail gallery"
            onClick={() => setHomeProjectGalleryViewMode("thumbnails")}
          >
            <FiGrid size={12} />
          </button>
          <button
            type="button"
            data-testid="home-project-view-list"
            className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
              galleryViewMode === "list"
                ? "border-blue-500/60 bg-blue-100 text-blue-700 dark:border-blue-500/70 dark:bg-blue-950/40 dark:text-blue-200"
                : "border-setta-200 text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            }`}
            aria-label="Show list view"
            onClick={() => setHomeProjectGalleryViewMode("list")}
          >
            <FiList size={12} />
          </button>
        </div>
      </div>

      <div className={galleryBodyClassName}>
        {favoriteProjects.length > 0 && (
          <ProjectGallerySection
            title="Favourites"
            dataTestId="home-project-favourites-section"
          >
            {galleryViewMode === "thumbnails" ? (
              <ProjectGridItems
                projects={favoriteProjects}
                isFavoriteSection
                defaultProjectConfigId={defaultProjectConfigId}
                selectedProjects={selectedProjects}
                onSelectProject={onSelectProject}
                onToggleProjectSelection={onToggleProjectSelection}
                selectionEnabled={selectionEnabled}
                isDeploymentMode={isDeploymentMode}
                activeProjectId={activeProjectId}
                onActivateProject={onActivateProject}
                onSetDefaultProject={onSetDefaultProject}
                onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
                compactGrid
              />
            ) : (
              <ProjectListItems
                projects={favoriteProjects}
                isFavoriteSection
                defaultProjectConfigId={defaultProjectConfigId}
                selectedProjects={selectedProjects}
                onSelectProject={onSelectProject}
                onToggleProjectSelection={onToggleProjectSelection}
                inSelectionMode={inSelectionMode}
                selectionEnabled={selectionEnabled}
                isDeploymentMode={isDeploymentMode}
                activeProjectId={activeProjectId}
                onActivateProject={onActivateProject}
                onSetDefaultProject={onSetDefaultProject}
                onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
              />
            )}
          </ProjectGallerySection>
        )}

        <ProjectGallerySection
          title={getHomeProjectConfigsSectionTitle(favoriteProjects.length > 0)}
          className={favoriteProjects.length > 0 ? "pt-2" : ""}
        >
          {galleryViewMode === "thumbnails" ? (
            <ProjectGridItems
              projects={nonFavoriteProjects}
              isFavoriteSection={false}
              defaultProjectConfigId={defaultProjectConfigId}
              selectedProjects={selectedProjects}
              onSelectProject={onSelectProject}
              onToggleProjectSelection={onToggleProjectSelection}
              selectionEnabled={selectionEnabled}
              isDeploymentMode={isDeploymentMode}
              activeProjectId={activeProjectId}
              onActivateProject={onActivateProject}
              onSetDefaultProject={onSetDefaultProject}
              onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
              dataTestId="home-project-grid"
            />
          ) : (
            <ProjectListItems
              projects={nonFavoriteProjects}
              isFavoriteSection={false}
              defaultProjectConfigId={defaultProjectConfigId}
              selectedProjects={selectedProjects}
              onSelectProject={onSelectProject}
              onToggleProjectSelection={onToggleProjectSelection}
              inSelectionMode={inSelectionMode}
              selectionEnabled={selectionEnabled}
              isDeploymentMode={isDeploymentMode}
              activeProjectId={activeProjectId}
              onActivateProject={onActivateProject}
              onSetDefaultProject={onSetDefaultProject}
              onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
            />
          )}
        </ProjectGallerySection>
      </div>
    </section>
  );
}

function ProjectGallerySection({
  title,
  children,
  dataTestId,
  className = "",
}: {
  title: string;
  children: ReactNode;
  dataTestId?: string;
  className?: string;
}) {
  return (
    <section className={`mb-2 last:mb-0 ${className}`} data-testid={dataTestId}>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ProjectGridItems({
  projects,
  isFavoriteSection,
  defaultProjectConfigId,
  selectedProjects,
  onSelectProject,
  onToggleProjectSelection,
  selectionEnabled,
  isDeploymentMode,
  activeProjectId,
  onActivateProject,
  onSetDefaultProject,
  onToggleFavoriteProjectConfig,
  compactGrid = false,
  dataTestId,
}: {
  projects: Array<ProjectConfig>;
  isFavoriteSection: boolean;
  defaultProjectConfigId: string | null;
  selectedProjects: Array<string>;
  onSelectProject: (id: string) => void;
  onToggleProjectSelection: (id: string) => void;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  activeProjectId: string | null;
  onActivateProject: (projectId: string) => void;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  compactGrid?: boolean;
  dataTestId?: string;
}) {
  if (projects.length === 0) {
    return (
      <p className="rounded border border-dashed border-setta-200 px-2 py-3 text-xs text-setta-400 dark:border-setta-800 dark:text-setta-500">
        No projects in this section.
      </p>
    );
  }
  const gridClassName = compactGrid
    ? "grid min-h-0 justify-start gap-3"
    : "grid min-h-0 justify-start gap-4";
  const gridStyle = {
    gridTemplateColumns: HOME_PROJECT_CARD_GRID_TEMPLATE_COLUMNS,
  };
  const showSelectionControls = selectionEnabled && selectedProjects.length > 0;

  return (
    <div className={gridClassName} style={gridStyle} data-testid={dataTestId}>
      {projects.map((project) => (
        <ProjectCard
          project={project}
          isFavorite={isFavoriteSection}
          isDefault={project.id === defaultProjectConfigId}
          key={project.id}
          isSelected={selectedProjects.includes(project.id)}
          isActive={activeProjectId === project.id}
          onSelectProject={onSelectProject}
          onToggleProjectSelection={onToggleProjectSelection}
          selectionEnabled={selectionEnabled}
          isDeploymentMode={isDeploymentMode}
          onActivate={() => onActivateProject(project.id)}
          onSetDefaultProject={onSetDefaultProject}
          onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
          showSelectionControls={showSelectionControls}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  isFavorite,
  isDefault,
  isSelected,
  isActive,
  onSelectProject,
  onToggleProjectSelection,
  selectionEnabled,
  isDeploymentMode,
  onActivate,
  onSetDefaultProject,
  onToggleFavoriteProjectConfig,
  showSelectionControls,
}: {
  project: ProjectConfig;
  isFavorite: boolean;
  isDefault: boolean;
  isSelected: boolean;
  isActive: boolean;
  onSelectProject: (id: string) => void;
  onToggleProjectSelection: (id: string) => void;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  onActivate: () => void;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  showSelectionControls: boolean;
}) {
  const navigate = useNavigate();
  const itemStyles = isActive
    ? "group/projectcard relative isolate grid grid-rows-[1fr_min-content] min-h-[13rem] w-full max-w-[14rem] overflow-hidden rounded-lg border border-blue-500 bg-blue-50/50 transition-colors dark:border-blue-500 dark:bg-blue-950/20"
    : "group/projectcard relative isolate grid grid-rows-[1fr_min-content] min-h-[13rem] w-full max-w-[14rem] overflow-hidden rounded-lg border border-setta-200 bg-setta-50/65 transition-colors hover:border-setta-300 dark:border-setta-700 dark:bg-setta-900/35 dark:hover:border-setta-600";
  const projectPath = resolveProjectPath(project.name, isDeploymentMode);

  function openProjectFromCard() {
    if (!projectPath) {
      return;
    }
    navigate(projectPath, {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }

  return (
    <article className={itemStyles} data-testid="home-project-card">
      <ThumbnailWrapper
        project={project}
        onSelectProject={onSelectProject}
        onOpenProject={openProjectFromCard}
        projectPath={projectPath}
        selectionEnabled={selectionEnabled}
        onActivate={onActivate}
      >
        <ThumbnailArea
          project={project}
          isSelected={isSelected}
          onToggleProjectSelection={onToggleProjectSelection}
          projectPath={projectPath}
          onOpenProject={openProjectFromCard}
          selectionEnabled={selectionEnabled}
          isFavorite={isFavorite}
          onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
          isDefault={isDefault}
          isDeploymentMode={isDeploymentMode}
          onSetDefaultProject={onSetDefaultProject}
          showSelectionControls={showSelectionControls}
        />
        <div className="col-start-1 col-end-2 row-start-2 row-end-3 w-full place-self-end bg-white px-3 py-2 dark:bg-setta-860">
          <p className="truncate text-sm text-setta-600 dark:text-setta-100">
            {project.name}
          </p>
        </div>
      </ThumbnailWrapper>
    </article>
  );
}

function ThumbnailWrapper({
  project,
  onSelectProject,
  onOpenProject,
  projectPath,
  selectionEnabled,
  onActivate,
  children,
}: {
  project: ProjectConfig;
  onSelectProject: (id: string) => void;
  onOpenProject: () => void;
  projectPath: string | null;
  selectionEnabled: boolean;
  onActivate: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="contents"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={() => {
        if (!selectionEnabled) {
          if (!projectPath) {
            return;
          }
          onOpenProject();
          return;
        }
        onSelectProject(project.id);
      }}
      onDoubleClick={() => {
        if (!projectPath) {
          return;
        }
        onOpenProject();
      }}
    >
      {children}
    </div>
  );
}

function ThumbnailArea({
  project,
  isSelected,
  onToggleProjectSelection,
  projectPath,
  onOpenProject,
  selectionEnabled,
  isFavorite,
  onToggleFavoriteProjectConfig,
  isDefault,
  isDeploymentMode,
  onSetDefaultProject,
  showSelectionControls,
}: {
  project: ProjectConfig;
  isSelected: boolean;
  onToggleProjectSelection: (id: string) => void;
  projectPath: string | null;
  onOpenProject: () => void;
  selectionEnabled: boolean;
  isFavorite: boolean;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  isDefault: boolean;
  isDeploymentMode: boolean;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  showSelectionControls: boolean;
}) {
  const hoverControlVisibilityClass =
    "opacity-0 pointer-events-none group-hover/projectcard:opacity-100 group-hover/projectcard:pointer-events-auto group-focus-within/projectcard:opacity-100 group-focus-within/projectcard:pointer-events-auto";
  const checkmarkVisibilityClass = showSelectionControls
    ? "opacity-100"
    : hoverControlVisibilityClass;
  const iconButtonBaseClass =
    "nodrag inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2";

  function onThumbnailKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    if (!projectPath) {
      return;
    }
    event.preventDefault();
    onOpenProject();
  }

  return (
    <ProjectConfigThumbnailSurface
      previewImgColor={project.previewImgColor}
      topLevelSections={project.topLevelSections}
      className="group/thumbnail absolute bottom-0 left-0 top-0"
      scalePreview={false}
      previewContainerProps={{ tabIndex: 0, onKeyDown: onThumbnailKeyDown }}
      overlay={
        <aside className="z-[1] col-start-1 col-end-2 row-start-1 row-end-2 -m-4 grid h-[calc(100%+2rem)] w-[calc(100%+2rem)] grid-rows-[auto_1fr_auto] p-1">
          <div className="flex items-start justify-between gap-1">
            {selectionEnabled && (
              <button
                className={`${iconButtonBaseClass} ${checkmarkVisibilityClass} ${
                  isSelected
                    ? "bg-blue-500 text-white"
                    : "bg-black/30 text-white/90 hover:bg-blue-500 hover:text-white dark:bg-setta-950/70"
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleProjectSelection(project.id);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={isSelected ? "Selected project" : "Select project"}
              >
                <IoMdCheckmark size={13} />
              </button>
            )}
            <button
              type="button"
              data-testid="home-project-favorite-toggle"
              className={`${iconButtonBaseClass} ${hoverControlVisibilityClass} ${
                isFavorite
                  ? "bg-black/30 text-amber-400 hover:bg-black/45 dark:bg-setta-950/70"
                  : "bg-black/30 text-white/90 hover:bg-black/45 hover:text-amber-400 dark:bg-setta-950/70"
              }`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleFavoriteProjectConfig(project.id);
              }}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label={
                isFavorite ? "Remove from favourites" : "Add to favourites"
              }
            >
              {isFavorite ? <IoStar size={13} /> : <IoStarOutline size={13} />}
            </button>
          </div>
          <div />
          {!isDeploymentMode && (
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="home-project-default-toggle"
                className={`${iconButtonBaseClass} ${hoverControlVisibilityClass} ${
                  isDefault
                    ? "bg-black/30 text-green-400 hover:bg-black/45 dark:bg-setta-950/70"
                    : "bg-black/30 text-white/90 hover:bg-black/45 hover:text-green-400 dark:bg-setta-950/70"
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void onSetDefaultProject(project.id);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={
                  isDefault ? "Default project" : "Make default project"
                }
                title={isDefault ? "Default project" : "Make default project"}
              >
                <HiHome size={13} />
              </button>
            </div>
          )}
        </aside>
      }
    />
  );
}

function ProjectListItems({
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
  projects: Array<ProjectConfig>;
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

function ProjectListItem({
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
  project: ProjectConfig;
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

  function openProjectFromRow() {
    if (!projectPath) {
      return;
    }
    navigate(projectPath, {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }

  function onRowClick(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!selectionEnabled) {
      openProjectFromRow();
      return;
    }
    onSelectProject(project.id);
  }

  function onRowDoubleClick() {
    openProjectFromRow();
  }

  function onRowKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openProjectFromRow();
      return;
    }
    if (event.key !== " ") {
      return;
    }
    event.preventDefault();
    if (shouldOpenProjectOnListRowSpace(selectionEnabled)) {
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
      onDoubleClick={onRowDoubleClick}
      onKeyDown={onRowKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={inSelectionMode ? isSelected : undefined}
    >
      {selectionEnabled && (
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
            onToggleProjectSelection(project.id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={isSelected ? "Unselect project" : "Select project"}
        >
          <IoMdCheckmark size={10} />
        </button>
      )}
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {!isDeploymentMode && (
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
            void onSetDefaultProject(project.id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={isDefault ? "Default project" : "Make default project"}
          title={isDefault ? "Default project" : "Make default project"}
        >
          <HiHome size={13} />
        </button>
      )}
      <button
        type="button"
        data-testid="home-project-favorite-toggle"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-setta-400 hover:bg-setta-100 hover:text-amber-500 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-amber-400"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleFavoriteProjectConfig(project.id);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
      >
        {isFavorite ? <IoStar size={13} /> : <IoStarOutline size={13} />}
      </button>
    </div>
  );
}

function resolveProjectPath(
  projectName: string,
  isDeploymentMode: boolean,
): string | null {
  if (!isDeploymentMode) {
    return pathRelativeToProject(projectName);
  }
  return buildSharePath(projectName);
}
