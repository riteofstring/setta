import { HomePageSearchBar } from "components/AppHeader/SearchBar/HomePageSearch";

import { FileBrowserPane } from "components/Panes/Overview/FileBrowser/FileBrowserPane";

import { ProjectConfigThumbnailSurface } from "components/ProjectConfigs/ProjectConfigThumbnailSurface";

import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";

import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";

import _ from "lodash";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FiGrid, FiList } from "react-icons/fi";

import { HiHome } from "react-icons/hi";

import { IoMdCheckmark } from "react-icons/io";

import { IoStar, IoStarOutline } from "react-icons/io5";

import { LuPenLine } from "react-icons/lu";

import { TbFolder } from "react-icons/tb";

import { useNavigate } from "react-router-dom";

import { setHomeProjectGalleryViewMode } from "state/actions/localStorage";

import { useHomeFileBrowserState } from "state/definitions";

import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";

import {
  getHomeProjectConfigsSectionTitle,
  getHomeProjectGalleryClassNames,
  getProjectThumbnailSurfaceProps,
  handleProjectThumbnailKeyDown,
  HOME_FILE_BROWSER_LIST_INSET_LEFT,
  HOME_FILE_BROWSER_META_INSET_CLASS,
  HOME_FILE_BROWSER_TITLE_INSET_CLASS,
  HOME_PROJECT_CARD_GRID_TEMPLATE_COLUMNS,
  HomeProject,
  navigateToProjectPath,
  shouldApplyHomeFileBrowserPath,
} from "./workspaceLayout";

import { ProjectListItems, resolveProjectPath } from "./projectListItems";

export function HomeFileBrowserColumn() {
  const { rootPath, pathSeparator, ignorePatterns } = useHomeFileBrowserState(
    (state) => ({
      rootPath: state.rootPath,
      pathSeparator: state.pathSeparator,
      ignorePatterns: state.ignorePatterns,
    }),
    _.isEqual,
  );
  const [pathInput, setPathInput] = useState("");
  const completionOptionsRef = useRef<{
    rootPath: string | null;
    pathSeparator?: string;
    ignorePatterns?: string[] | null;
    allowOutsideWorkspaceRoot?: boolean;
  }>({ rootPath: null });
  completionOptionsRef.current.rootPath = rootPath;
  completionOptionsRef.current.pathSeparator = pathSeparator;
  completionOptionsRef.current.ignorePatterns = ignorePatterns;
  completionOptionsRef.current.allowOutsideWorkspaceRoot = true;
  const completionSource = useMemo(
    () =>
      createDynamicFolderPathCompletionSource(
        () => completionOptionsRef.current,
      ),
    [],
  );
  const blurTriggeredByEscapeKey = useRef(false);
  const blurActiveElement = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }, []);
  const pathKeyComboActions = useMemo(
    () => ({
      Escape: () => {
        blurTriggeredByEscapeKey.current = true;
        setPathInput(rootPath ?? "");
        blurActiveElement();
        return true;
      },
    }),
    [blurActiveElement, rootPath],
  );
  const browserPathDummyInputClassName =
    "flex-1 min-w-0 cursor-text truncate bg-transparent pl-6 py-1 text-xs leading-4 outline-0 placeholder-setta-300 dark:placeholder-setta-700 font-sans";
  const browserPathInputClassName =
    "setta-cm-browser-path-input flex-1 min-w-0 h-full cursor-text truncate bg-transparent outline-0 [&_.cm-content]:!py-1 [&_.cm-content]:!pl-6 [&_.cm-content]:!pr-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs [&_.cm-content]:!leading-4 [&_.cm-content]:text-setta-700 dark:[&_.cm-content]:text-setta-200 [&_.cm-placeholder]:text-setta-300 dark:[&_.cm-placeholder]:text-setta-700 [&_.cm-content]:font-sans";
  useEffect(() => {
    if (!rootPath) {
      return;
    }
    setPathInput(rootPath);
  }, [rootPath]);
  function applyPath(nextPathValue?: string) {
    const nextPath = (nextPathValue ?? pathInput).trim();
    if (
      !shouldApplyHomeFileBrowserPath({
        nextPath,
        currentRootPath: useHomeFileBrowserState.getState().rootPath,
      })
    ) {
      return;
    }
    useHomeFileBrowserState.setState({
      rootPath: nextPath,
      selectedPath: nextPath,
      expandedPaths: { [nextPath]: true },
    });
  }
  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col pb-2 [&_[data-testid='setta-initialized-folder-icon']]:text-blue-500 dark:[&_[data-testid='setta-initialized-folder-icon']]:text-blue-400">
      <div
        className={`flex flex-col gap-2 ${HOME_FILE_BROWSER_META_INSET_CLASS}`}
      >
        <div className="flex items-center gap-2">
          <search
            data-testid="home-file-browser-path-input"
            className="nodrag group/folderpath relative mx-[2px] flex h-7 min-w-0 flex-1 overflow-hidden border-solid border-transparent bg-transparent [border-width:0_0_1px_0] focus-within:border-blue-300 dark:text-setta-200"
          >
            <TbFolder
              className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-setta-400 dark:text-setta-600"
              size={14}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden opacity-100 transition-opacity duration-0 group-focus-within/folderpath:opacity-0 group-focus-within/folderpath:duration-150"
            >
              <span className="block min-w-0 truncate py-1 pl-6 font-sans text-xs leading-4 text-setta-700 dark:text-setta-200">
                {pathInput}
              </span>
            </div>
            <InlineCodeMirrorInput
              id="CodeMirror-home-browser-path"
              value={pathInput}
              onChange={setPathInput}
              onBlur={(value) => {
                if (blurTriggeredByEscapeKey.current) {
                  blurTriggeredByEscapeKey.current = false;
                  return;
                }
                applyPath(value);
              }}
              onEnter={(_, completionResult) => {
                if (completionResult) {
                  return;
                }
                blurActiveElement();
              }}
              className={browserPathInputClassName}
              dummyClassName={browserPathDummyInputClassName}
              singleLine
              completionsFn={completionSource ?? undefined}
              completionInteractionDelayMs={0}
              completionTriggerChars={["/", "\\"]}
              keyComboActions={pathKeyComboActions}
              tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
            />
          </search>
          <button
            type="button"
            className="h-8 rounded-md border border-setta-200 bg-white px-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={() => applyPath()}
          >
            Go
          </button>
        </div>
      </div>
      <div className="min-h-[220px] min-w-0 flex-1">
        <FileBrowserPane
          useFileBrowserStateHook={useHomeFileBrowserState}
          showPathNavigation={false}
          includeSettaInitializedFolders
          showSettaInitializedBadgePill={false}
          allowOutsideWorkspaceRoot
          metaPaddingClassName={HOME_FILE_BROWSER_META_INSET_CLASS}
          listInsetLeft={HOME_FILE_BROWSER_LIST_INSET_LEFT}
        />
      </div>
    </section>
  );
}

type ProjectGalleryContentProps = {
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
  galleryViewMode: "thumbnails" | "list";
  compactGrid?: boolean;
  dataTestId?: string;
};

function HomeProjectGalleryViewToggle({
  galleryViewMode,
}: {
  galleryViewMode: "thumbnails" | "list";
}) {
  return (
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
  );
}

function ProjectGalleryContent({
  galleryViewMode,
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
  compactGrid = false,
  dataTestId,
}: ProjectGalleryContentProps) {
  if (galleryViewMode === "thumbnails") {
    return (
      <ProjectGridItems
        projects={projects}
        isFavoriteSection={isFavoriteSection}
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
        compactGrid={compactGrid}
        dataTestId={dataTestId}
      />
    );
  }
  return (
    <ProjectListItems
      projects={projects}
      isFavoriteSection={isFavoriteSection}
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
  );
}

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
  favoriteProjects: Array<HomeProject>;
  nonFavoriteProjects: Array<HomeProject>;
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
  const galleryClassNames = getHomeProjectGalleryClassNames(fullScreenSurface);
  if (totalProjectsCount === 0) {
    return (
      <section
        className={galleryClassNames.surface}
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
      className={galleryClassNames.surface}
      data-testid="home-project-gallery"
    >
      <div className={galleryClassNames.header}>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
          Projects
        </h2>
        <div className="flex min-w-0 flex-1 justify-center">
          <HomePageSearchBar
            className={`${HOME_FILE_BROWSER_TITLE_INSET_CLASS} max-w-sm`}
          />
        </div>
        <HomeProjectGalleryViewToggle galleryViewMode={galleryViewMode} />
      </div>

      <div className={galleryClassNames.body}>
        {favoriteProjects.length > 0 && (
          <ProjectGallerySection
            title="Favourites"
            dataTestId="home-project-favourites-section"
          >
            <ProjectGalleryContent
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
              galleryViewMode={galleryViewMode}
              compactGrid
            />
          </ProjectGallerySection>
        )}

        <ProjectGallerySection
          title={getHomeProjectConfigsSectionTitle(favoriteProjects.length > 0)}
          className={favoriteProjects.length > 0 ? "pt-2" : ""}
        >
          <ProjectGalleryContent
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
            galleryViewMode={galleryViewMode}
            dataTestId="home-project-grid"
          />
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
  children: React.ReactNode;
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
  projects: Array<HomeProject>;
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
  project: HomeProject;
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
  const openProjectFromCard = () =>
    navigateToProjectPath({ navigate, projectPath });
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
  project: HomeProject;
  onSelectProject: (id: string) => void;
  onOpenProject: () => void;
  projectPath: string | null;
  selectionEnabled: boolean;
  onActivate: () => void;
  children: React.ReactNode;
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

function ProjectThumbnailSelectionButton({
  iconButtonBaseClass,
  isSelected,
  onToggleProjectSelection,
  projectId,
  visibilityClass,
}: {
  iconButtonBaseClass: string;
  isSelected: boolean;
  onToggleProjectSelection: (id: string) => void;
  projectId: string;
  visibilityClass: string;
}) {
  return (
    <button
      className={`${iconButtonBaseClass} ${visibilityClass} ${
        isSelected
          ? "bg-blue-500 text-white"
          : "bg-black/30 text-white/90 hover:bg-blue-500 hover:text-white dark:bg-setta-950/70"
      }`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleProjectSelection(projectId);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={isSelected ? "Selected project" : "Select project"}
    >
      <IoMdCheckmark size={13} />
    </button>
  );
}

function ProjectThumbnailFavoriteButton({
  iconButtonBaseClass,
  isFavorite,
  onToggleFavoriteProjectConfig,
  projectId,
  visibilityClass,
}: {
  iconButtonBaseClass: string;
  isFavorite: boolean;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  projectId: string;
  visibilityClass: string;
}) {
  return (
    <button
      type="button"
      data-testid="home-project-favorite-toggle"
      className={`${iconButtonBaseClass} ${visibilityClass} ${
        isFavorite
          ? "bg-black/30 text-amber-400 hover:bg-black/45 dark:bg-setta-950/70"
          : "bg-black/30 text-white/90 hover:bg-black/45 hover:text-amber-400 dark:bg-setta-950/70"
      }`}
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

function ProjectThumbnailDefaultButton({
  iconButtonBaseClass,
  isDefault,
  onSetDefaultProject,
  projectId,
  visibilityClass,
}: {
  iconButtonBaseClass: string;
  isDefault: boolean;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  projectId: string;
  visibilityClass: string;
}) {
  return (
    <button
      type="button"
      data-testid="home-project-default-toggle"
      className={`${iconButtonBaseClass} ${visibilityClass} ${
        isDefault
          ? "bg-black/30 text-green-400 hover:bg-black/45 dark:bg-setta-950/70"
          : "bg-black/30 text-white/90 hover:bg-black/45 hover:text-green-400 dark:bg-setta-950/70"
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

function ProjectThumbnailOverlay({
  isDefault,
  isDeploymentMode,
  isFavorite,
  isSelected,
  onSetDefaultProject,
  onToggleFavoriteProjectConfig,
  onToggleProjectSelection,
  projectId,
  selectionEnabled,
  showSelectionControls,
}: {
  isDefault: boolean;
  isDeploymentMode: boolean;
  isFavorite: boolean;
  isSelected: boolean;
  onSetDefaultProject: (projectConfigId: string) => Promise<void>;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  onToggleProjectSelection: (id: string) => void;
  projectId: string;
  selectionEnabled: boolean;
  showSelectionControls: boolean;
}) {
  const hoverControlVisibilityClass =
    "opacity-0 pointer-events-none group-hover/projectcard:opacity-100 group-hover/projectcard:pointer-events-auto group-focus-within/projectcard:opacity-100 group-focus-within/projectcard:pointer-events-auto";
  const checkmarkVisibilityClass = showSelectionControls
    ? "opacity-100"
    : hoverControlVisibilityClass;
  const iconButtonBaseClass =
    "nodrag inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2";

  return (
    <aside className="z-[1] col-start-1 col-end-2 row-start-1 row-end-2 -m-4 grid h-[calc(100%+2rem)] w-[calc(100%+2rem)] grid-rows-[auto_1fr_auto] p-1">
      <div className="flex items-start justify-between gap-1">
        {selectionEnabled && (
          <ProjectThumbnailSelectionButton
            iconButtonBaseClass={iconButtonBaseClass}
            isSelected={isSelected}
            onToggleProjectSelection={onToggleProjectSelection}
            projectId={projectId}
            visibilityClass={checkmarkVisibilityClass}
          />
        )}
        <ProjectThumbnailFavoriteButton
          iconButtonBaseClass={iconButtonBaseClass}
          isFavorite={isFavorite}
          onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
          projectId={projectId}
          visibilityClass={hoverControlVisibilityClass}
        />
      </div>
      <div />
      {!isDeploymentMode && (
        <div className="flex justify-end">
          <ProjectThumbnailDefaultButton
            iconButtonBaseClass={iconButtonBaseClass}
            isDefault={isDefault}
            onSetDefaultProject={onSetDefaultProject}
            projectId={projectId}
            visibilityClass={hoverControlVisibilityClass}
          />
        </div>
      )}
    </aside>
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
  project: HomeProject;
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
  const thumbnailSurfaceProps = getProjectThumbnailSurfaceProps(project);
  return (
    <ProjectConfigThumbnailSurface
      {...thumbnailSurfaceProps}
      className="group/thumbnail absolute bottom-0 left-0 top-0"
      scalePreview={false}
      previewContainerProps={{
        tabIndex: 0,
        onKeyDown: (event) =>
          handleProjectThumbnailKeyDown({
            event,
            onOpenProject,
            projectPath,
          }),
      }}
      overlay={
        <ProjectThumbnailOverlay
          isDefault={isDefault}
          isDeploymentMode={isDeploymentMode}
          isFavorite={isFavorite}
          isSelected={isSelected}
          onSetDefaultProject={onSetDefaultProject}
          onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
          onToggleProjectSelection={onToggleProjectSelection}
          projectId={project.id}
          selectionEnabled={selectionEnabled}
          showSelectionControls={showSelectionControls}
        />
      }
    />
  );
}
