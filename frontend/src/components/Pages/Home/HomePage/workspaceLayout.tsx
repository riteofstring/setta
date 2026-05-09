import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";

import { togglePaneVisibility } from "components/Panes/paneLayout";

import { GridWrapper } from "components/Utils/GridWrapper";

import { PaneContainer } from "components/Utils/PaneContainer";

import { withRightPaneTitleClearance } from "components/Utils/paneTitleSpacing";

import _ from "lodash";

import { matchSorter } from "match-sorter";

import { setAsDefaultProject } from "openapi/http";

import { useEffect, useMemo, useState } from "react";

import { BiPlus } from "react-icons/bi";

import { IoClose, IoSettingsOutline } from "react-icons/io5";

import { TbFolder, TbListDetails } from "react-icons/tb";

import { Link, type NavigateFunction } from "react-router-dom";

import { toggleFavoriteProjectConfig } from "state/actions/localStorage";

import { openDeleteProjectWarningModal } from "state/actions/modal";

import {
  loadAllProjectMetadata,
  useCreateAndGoToProjectConfig,
} from "state/actions/project/loadProject";

import {
  useAllProjectMetadata,
  useHomePageSearch,
  useLocalStorage,
  useProjectLoading,
  useShareSession,
} from "state/definitions";

import { useWindowSize } from "state/hooks/utils";

import {
  APP_CHROME_Z_INDEX_CLASS_NAME,
  CLOSED_PANE_WIDTH,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  HOME_COMPACT_LAYOUT_BREAKPOINT_PX,
  PAGE_LOAD_TYPES,
  PaneNameEnum,
  SETTA_POPOVER_PORTAL_PARENT_ID,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";

import {
  type ProjectConfig,
  type ProjectConfigMetadata,
} from "utils/generatedTypes";

import { LoadingSpinner } from "../../LoadingSpinner";

import {
  HomeFileBrowserColumn,
  HomeProjectGallery,
} from "./fileBrowserAndGallery";

import { SelectedProjectDetails } from "./projectListItems";

export const HOME_MIN_PANE_WIDTH = 260;

export const HOME_PROJECT_CARD_GRID_TEMPLATE_COLUMNS =
  "repeat(auto-fill, minmax(10.5rem, 14rem))";

export const HOME_FILE_BROWSER_META_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";

export const HOME_FILE_BROWSER_TITLE_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";

export const HOME_FILE_BROWSER_LIST_INSET_LEFT = 10;

export const HOME_PANE_TITLE_CLASS =
  "mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500";

export const HOME_FILE_BROWSER_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden";

export const HOME_INSET_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-2";

export const HOME_SIDE_RAIL_CLASS_NAME = `${APP_CHROME_Z_INDEX_CLASS_NAME} fixed flex w-10 flex-col items-center gap-1 bg-setta-50 py-2 dark:bg-setta-900`;

export const HOME_RIGHT_PANE_TITLE_CLASS_NAME = withRightPaneTitleClearance(
  HOME_PANE_TITLE_CLASS,
);

export const HOME_PROJECT_GALLERY_CLASS_NAMES = {
  default: {
    surface:
      "flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-3 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40",
    header: "mb-2 flex items-center justify-between gap-2",
    body: "min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1",
  },
  fullScreen: {
    surface: "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
    header:
      "flex items-center justify-between gap-2 border-b border-setta-200/80 bg-setta-50/80 px-3 py-2 dark:border-setta-800/80 dark:bg-setta-900/40",
    body: "setta-pane-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto !px-3 py-2",
  },
} as const;

export type HomeProject = ProjectConfigMetadata &
  Partial<Pick<ProjectConfig, "previewImgColor" | "topLevelSections">>;

export function shouldUseCompactHomeLayout(
  winWidth: number | undefined,
): boolean {
  if (typeof winWidth === "number") {
    return winWidth < HOME_COMPACT_LAYOUT_BREAKPOINT_PX;
  }
  if (typeof window !== "undefined") {
    return window.innerWidth < HOME_COMPACT_LAYOUT_BREAKPOINT_PX;
  }
  return false;
}

export function shouldApplyHomeFileBrowserPath({
  nextPath,
  currentRootPath,
}: {
  nextPath: string;
  currentRootPath: string | null;
}): boolean {
  if (!nextPath) {
    return false;
  }
  return nextPath !== currentRootPath;
}

export function partitionProjectsByFavoriteStatus({
  projects,
  favoriteProjectConfigIds,
}: {
  projects: Array<HomeProject>;
  favoriteProjectConfigIds: Set<string>;
}): {
  favoriteProjects: Array<HomeProject>;
  nonFavoriteProjects: Array<HomeProject>;
  totalProjectsCount: number;
} {
  const favoriteProjects: Array<HomeProject> = [];
  const nonFavoriteProjects: Array<HomeProject> = [];
  for (const project of projects) {
    if (favoriteProjectConfigIds.has(project.id)) {
      favoriteProjects.push(project);
      continue;
    }
    nonFavoriteProjects.push(project);
  }
  return {
    favoriteProjects,
    nonFavoriteProjects,
    totalProjectsCount: projects.length,
  };
}

export function getHomeProjectConfigsSectionTitle(
  hasFavorites: boolean,
): string {
  if (hasFavorites) {
    return "Other Projects";
  }
  return "All Projects";
}

export function shouldOpenProjectOnListRowSpace(
  selectionEnabled: boolean,
): boolean {
  return !selectionEnabled;
}

export function shouldShowCompactHomeSettingsButton({
  isCompactLayout,
  isDeploymentMode,
}: {
  isCompactLayout: boolean;
  isDeploymentMode: boolean;
}): boolean {
  return isCompactLayout && !isDeploymentMode;
}

export function getNextActiveProjectId({
  activeProjectId,
  filteredProjects,
}: {
  activeProjectId: string | null;
  filteredProjects: Array<HomeProject>;
}): string | null {
  if (filteredProjects.length === 0) {
    return null;
  }
  if (
    activeProjectId &&
    filteredProjects.some((project) => project.id === activeProjectId)
  ) {
    return activeProjectId;
  }
  return filteredProjects[0]?.id ?? null;
}

export function resolveSelectedProjectDetails({
  activeProjectId,
  filteredProjects,
  projects,
  selectedProjects,
}: {
  activeProjectId: string | null;
  filteredProjects: Array<HomeProject>;
  projects: Array<HomeProject>;
  selectedProjects: Array<string>;
}): HomeProject | null {
  const selectedProjectId = selectedProjects[0];
  if (selectedProjectId) {
    const selectedProject =
      filteredProjects.find((project) => project.id === selectedProjectId) ??
      projects.find((project) => project.id === selectedProjectId);
    if (selectedProject) {
      return selectedProject;
    }
  }
  if (activeProjectId) {
    const activeProject = filteredProjects.find(
      (project) => project.id === activeProjectId,
    );
    if (activeProject) {
      return activeProject;
    }
  }
  return filteredProjects[0] ?? null;
}

export function syncStoredFavoriteProjectIds({
  hasLoadedProjectMetadata,
  projects,
}: {
  hasLoadedProjectMetadata: boolean;
  projects: Array<HomeProject>;
}) {
  if (!hasLoadedProjectMetadata) {
    return;
  }
  const validProjectIds = new Set(projects.map((project) => project.id));
  const currentFavoriteIds =
    useLocalStorage.getState().favoriteProjectConfigIds;
  const nextFavoriteIds = currentFavoriteIds.filter((id) =>
    validProjectIds.has(id),
  );
  if (nextFavoriteIds.length === currentFavoriteIds.length) {
    return;
  }
  useLocalStorage.setState({ favoriteProjectConfigIds: nextFavoriteIds });
}

export function filterValidSelectedProjectIds(
  previousProjects: Array<string>,
  validProjectIds: Set<string>,
): Array<string> {
  if (previousProjects.length === 0) {
    return previousProjects;
  }
  const nextSelectedProjects = previousProjects.filter((id) =>
    validProjectIds.has(id),
  );
  if (nextSelectedProjects.length === previousProjects.length) {
    return previousProjects;
  }
  return nextSelectedProjects;
}

export function selectSingleProjectId(
  previousProjects: Array<string>,
  projectConfigId: string,
): Array<string> {
  if (
    previousProjects.length === 1 &&
    previousProjects[0] === projectConfigId
  ) {
    return previousProjects;
  }
  return [projectConfigId];
}

export function toggleSelectedProjectId(
  previousProjects: Array<string>,
  projectConfigId: string,
): Array<string> {
  if (previousProjects.includes(projectConfigId)) {
    return previousProjects.filter(
      (projectId) => projectId !== projectConfigId,
    );
  }
  return [...previousProjects, projectConfigId];
}

export function getDeleteProjectTargets({
  projects,
  selectedProjects,
}: {
  projects: Array<HomeProject>;
  selectedProjects: Array<string>;
}) {
  return selectedProjects.map((projectId) => ({
    id: projectId,
    name: projects.find((project) => project.id === projectId)?.name ?? "",
  }));
}

export function getHomePaneInset({
  paneVisible,
  paneWidth,
  showSidePanes,
}: {
  paneVisible: boolean;
  paneWidth: number;
  showSidePanes: boolean;
}): number {
  if (!showSidePanes) {
    return 0;
  }
  return paneVisible ? paneWidth : CLOSED_PANE_WIDTH;
}

export function getHomeProjectGalleryClassNames(fullScreenSurface: boolean) {
  return HOME_PROJECT_GALLERY_CLASS_NAMES[
    fullScreenSurface ? "fullScreen" : "default"
  ];
}

export function navigateToProjectPath({
  navigate,
  projectPath,
}: {
  navigate: NavigateFunction;
  projectPath: string | null;
}) {
  if (!projectPath) {
    return;
  }
  navigate(projectPath, {
    state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
  });
}

export function handleProjectThumbnailKeyDown({
  event,
  onOpenProject,
  projectPath,
}: {
  event: React.KeyboardEvent<HTMLDivElement>;
  onOpenProject: () => void;
  projectPath: string | null;
}) {
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

export function handleProjectListRowKeyDown({
  event,
  onOpenProject,
  onSelectProject,
  projectId,
  selectionEnabled,
}: {
  event: React.KeyboardEvent<HTMLDivElement>;
  onOpenProject: () => void;
  onSelectProject: (id: string) => void;
  projectId: string;
  selectionEnabled: boolean;
}) {
  if (event.target !== event.currentTarget) {
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    onOpenProject();
    return;
  }
  if (event.key !== " ") {
    return;
  }
  event.preventDefault();
  if (shouldOpenProjectOnListRowSpace(selectionEnabled)) {
    onOpenProject();
    return;
  }
  onSelectProject(projectId);
}

export function shouldShowSelectedProjectOpenLink({
  isDeploymentMode,
  projectPath,
}: {
  isDeploymentMode: boolean;
  projectPath: string | null;
}) {
  return Boolean(projectPath) && !isDeploymentMode;
}

export function getSelectedProjectDetailsContainerClassName(
  hideTitle: boolean,
): string {
  if (hideTitle) {
    return "setta-pane-scroll flex h-full min-h-0 flex-col gap-2 text-xs text-setta-600 dark:text-setta-300";
  }
  return "flex h-full min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40";
}

export function getProjectThumbnailSurfaceProps(project: HomeProject): {
  previewImgColor?: HomeProject["previewImgColor"];
  topLevelSections?: HomeProject["topLevelSections"];
} {
  const props: {
    previewImgColor?: HomeProject["previewImgColor"];
    topLevelSections?: HomeProject["topLevelSections"];
  } = {};
  if (project.previewImgColor !== undefined) {
    props.previewImgColor = project.previewImgColor;
  }
  if (project.topLevelSections !== undefined) {
    props.topLevelSections = project.topLevelSections;
  }
  return props;
}

export function HomePage() {
  const { projectMetadata, defaultProjectConfigId } = useAllProjectMetadata(
    (x) => x,
    _.isEqual,
  );
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);
  const [hasLoadedProjectMetadata, setHasLoadedProjectMetadata] =
    useState(false);
  useEffect(() => {
    let isCancelled = false;
    // load manually on first load because websocket might take time to connect
    void (async () => {
      const loadedProjectMetadata = await loadAllProjectMetadata();
      if (isCancelled || !loadedProjectMetadata) {
        return;
      }
      setHasLoadedProjectMetadata(true);
    })();
    useProjectLoading.getState().reset();
    return () => {
      isCancelled = true;
    };
  }, []);
  if (isCreatingConfig) {
    return (
      <GridWrapper gridStyles="bg-setta-100 dark:bg-setta-dark">
        <LoadingSpinner />
      </GridWrapper>
    );
  }
  return (
    <HomeWorkspaceLayout
      projects={projectMetadata}
      defaultProjectConfigId={defaultProjectConfigId}
      setIsCreatingConfig={setIsCreatingConfig}
      isDeploymentMode={isDeploymentMode}
      hasLoadedProjectMetadata={hasLoadedProjectMetadata}
    />
  );
}

export function HomeWorkspaceHeader({
  hasSelectedProjects,
  isDeploymentMode,
  onCreateProject,
  onDeleteProjects,
  showCompactSettingsButton,
}: {
  hasSelectedProjects: boolean;
  isDeploymentMode: boolean;
  onCreateProject: () => void;
  onDeleteProjects: () => void;
  showCompactSettingsButton: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-setta-200/80 bg-white/80 px-3 py-2 backdrop-blur dark:border-setta-800/80 dark:bg-setta-950/70">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        {isDeploymentMode ? (
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-setta-500 dark:text-setta-300">
            Sharing mode is read-only.
          </div>
        ) : (
          <h2 className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-setta-500 dark:text-setta-300">
            Workspace Projects
          </h2>
        )}
      </div>
      {!isDeploymentMode && (
        <div className="flex flex-wrap gap-2">
          {showCompactSettingsButton && (
            <Link
              to={SETTINGS_ROUTER_PATH}
              state={{
                pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG,
              }}
              data-testid="home-compact-settings-link"
              className="nodrag inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-setta-300 bg-white px-3 text-xs font-semibold text-setta-700 transition-colors hover:border-setta-400 hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-100 dark:hover:border-setta-600 dark:hover:bg-setta-900"
              aria-label="Open settings"
            >
              <IoSettingsOutline />
              Settings
            </Link>
          )}
          <button
            className="nodrag inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-setta-300 bg-white px-3 text-xs font-semibold text-setta-700 transition-colors hover:border-setta-400 hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-100 dark:hover:border-setta-600 dark:hover:bg-setta-900"
            onClick={onCreateProject}
          >
            <BiPlus />
            New Project
          </button>
          <button
            className="nodrag inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-setta-300 bg-white px-3 text-xs font-semibold text-setta-700 transition-colors hover:border-red-500 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-55 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-100 dark:hover:border-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-200"
            onClick={onDeleteProjects}
            disabled={!hasSelectedProjects}
          >
            <IoClose />
            Delete
          </button>
        </div>
      )}
    </header>
  );
}

export function HomeWorkspaceLayout({
  projects,
  defaultProjectConfigId,
  setIsCreatingConfig,
  isDeploymentMode,
  hasLoadedProjectMetadata,
}: {
  projects: Array<HomeProject>;
  defaultProjectConfigId: string | null;
  setIsCreatingConfig: (newVal: boolean) => void;
  isDeploymentMode: boolean;
  hasLoadedProjectMetadata: boolean;
}) {
  const [selectedProjects, setSelectedProjects] = useState<Array<string>>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();
  const selectionEnabled = !isDeploymentMode;
  const searchValue = useHomePageSearch((x) => x.value);
  const {
    favoriteProjectConfigIds,
    homeProjectGalleryViewMode,
    homeWorkspacePaneVis,
    homeWorkspacePaneWidth,
    homeSelectedProjectPaneVis,
    homeSelectedProjectPaneWidth,
  } = useLocalStorage(
    (state) => ({
      favoriteProjectConfigIds: state.favoriteProjectConfigIds,
      homeProjectGalleryViewMode: state.homeProjectGalleryViewMode,
      homeWorkspacePaneVis: state.homeWorkspacePaneVis,
      homeWorkspacePaneWidth: state.homeWorkspacePaneWidth,
      homeSelectedProjectPaneVis: state.homeSelectedProjectPaneVis,
      homeSelectedProjectPaneWidth: state.homeSelectedProjectPaneWidth,
    }),
    _.isEqual,
  );
  const { winWidth } = useWindowSize();
  const isCompactLayout = shouldUseCompactHomeLayout(winWidth);
  const filteredProjects = useMemo(
    () => matchSorter(projects, searchValue, { keys: ["name"] }),
    [projects, searchValue],
  );
  const favoriteIdSet = useMemo(
    () => new Set(favoriteProjectConfigIds),
    [favoriteProjectConfigIds],
  );
  const { favoriteProjects, nonFavoriteProjects, totalProjectsCount } = useMemo(
    () =>
      partitionProjectsByFavoriteStatus({
        projects: filteredProjects,
        favoriteProjectConfigIds: favoriteIdSet,
      }),
    [filteredProjects, favoriteIdSet],
  );
  useEffect(() => {
    if (isDeploymentMode) {
      setSelectedProjects([]);
    }
  }, [isDeploymentMode]);
  useEffect(() => {
    syncStoredFavoriteProjectIds({ hasLoadedProjectMetadata, projects });
  }, [hasLoadedProjectMetadata, projects]);
  useEffect(() => {
    const validProjectIds = new Set(projects.map((project) => project.id));
    setSelectedProjects((previousProjects) =>
      filterValidSelectedProjectIds(previousProjects, validProjectIds),
    );
  }, [projects]);
  useEffect(() => {
    setActiveProjectId((previousProjectId) =>
      getNextActiveProjectId({
        activeProjectId: previousProjectId,
        filteredProjects,
      }),
    );
  }, [filteredProjects]);
  const selectedDetailProject = useMemo(
    () =>
      resolveSelectedProjectDetails({
        activeProjectId,
        filteredProjects,
        projects,
        selectedProjects,
      }),
    [activeProjectId, filteredProjects, projects, selectedProjects],
  );
  async function handleCreateConfig() {
    setIsCreatingConfig(true);
    await createAndGoToProjectConfig();
  }
  function onSelectProject(projectConfigId: string) {
    setActiveProjectId(projectConfigId);
    if (selectionEnabled) {
      setSelectedProjects((previousProjects) =>
        selectSingleProjectId(previousProjects, projectConfigId),
      );
    }
  }
  function onToggleProjectSelection(projectConfigId: string) {
    if (!selectionEnabled) {
      return;
    }
    setActiveProjectId(projectConfigId);
    setSelectedProjects((previousProjects) =>
      toggleSelectedProjectId(previousProjects, projectConfigId),
    );
  }
  function onClickDelete() {
    openDeleteProjectWarningModal({
      selectedProjectsIdName: getDeleteProjectTargets({
        projects,
        selectedProjects,
      }),
    });
  }
  function onEscapeClearSelectedProjects(e: React.KeyboardEvent) {
    if (e.code === "Escape") {
      setSelectedProjects([]);
    }
  }
  async function onSetDefaultProject(projectConfigId: string) {
    await callOpenAPI(
      setAsDefaultProject({
        body: {
          projectConfigId,
        },
      } as Parameters<typeof setAsDefaultProject>[0]),
    );
  }
  const commonGalleryProps = {
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
    onActivateProject: setActiveProjectId,
    onSetDefaultProject,
    onToggleFavoriteProjectConfig: toggleFavoriteProjectConfig,
    galleryViewMode: homeProjectGalleryViewMode,
  };
  const showSidePanes = !isCompactLayout;
  const middleInsetLeft = getHomePaneInset({
    paneVisible: homeWorkspacePaneVis,
    paneWidth: homeWorkspacePaneWidth,
    showSidePanes,
  });
  const middleInsetRight = getHomePaneInset({
    paneVisible: homeSelectedProjectPaneVis,
    paneWidth: homeSelectedProjectPaneWidth,
    showSidePanes,
  });
  const showCompactSettingsButton = shouldShowCompactHomeSettingsButton({
    isCompactLayout,
    isDeploymentMode,
  });
  return (
    <>
      {showSidePanes && (
        <HomeLeftIconRail
          workspacePaneVisible={homeWorkspacePaneVis}
          isDeploymentMode={isDeploymentMode}
        />
      )}
      {showSidePanes && (
        <HomeRightIconRail
          selectedProjectPaneVisible={homeSelectedProjectPaneVis}
        />
      )}
      {showSidePanes && (
        <PaneContainer
          paneName={PaneNameEnum.homeWorkspace}
          right={false}
          minimumWidth={HOME_MIN_PANE_WIDTH}
          vis={homeWorkspacePaneVis}
          width={homeWorkspacePaneWidth}
          paddingClassName="pt-2.5 pb-0"
        >
          {homeWorkspacePaneVis && (
            <section
              className={HOME_FILE_BROWSER_PANE_CONTENT_CLASS}
              data-testid="home-file-browser-column"
            >
              <div className={HOME_FILE_BROWSER_TITLE_INSET_CLASS}>
                <h2 className={HOME_PANE_TITLE_CLASS}>Workspace Browser</h2>
              </div>
              <HomeFileBrowserColumn />
            </section>
          )}
        </PaneContainer>
      )}
      {showSidePanes && (
        <PaneContainer
          paneName={PaneNameEnum.homeSelectedProject}
          right={true}
          minimumWidth={HOME_MIN_PANE_WIDTH}
          vis={homeSelectedProjectPaneVis}
          width={homeSelectedProjectPaneWidth}
        >
          {homeSelectedProjectPaneVis && (
            <section className={HOME_INSET_PANE_CONTENT_CLASS}>
              <h2 className={HOME_RIGHT_PANE_TITLE_CLASS_NAME}>
                Selected Project
              </h2>
              <SelectedProjectDetails
                project={selectedDetailProject}
                isDefault={selectedDetailProject?.id === defaultProjectConfigId}
                isDeploymentMode={isDeploymentMode}
                hideTitle
              />
            </section>
          )}
        </PaneContainer>
      )}
      <GridWrapper gridStyles="bg-setta-100 dark:bg-setta-dark">
        <main
          className="relative z-0 flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-x border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950"
          style={{
            paddingLeft: middleInsetLeft,
            paddingRight: middleInsetRight,
          }}
          onKeyDown={onEscapeClearSelectedProjects}
          data-testid="home-file-manager-layout"
        >
          <HomeWorkspaceHeader
            hasSelectedProjects={selectedProjects.length > 0}
            isDeploymentMode={isDeploymentMode}
            onCreateProject={handleCreateConfig}
            onDeleteProjects={onClickDelete}
            showCompactSettingsButton={showCompactSettingsButton}
          />
          <HomeProjectGallery {...commonGalleryProps} fullScreenSurface />
        </main>
      </GridWrapper>
      <div
        className="setta-codemirror-tooltips pointer-events-auto absolute left-0 top-0 z-[300] h-px w-px overflow-visible"
        id={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      <div
        className="setta-popover-portals pointer-events-auto absolute left-0 top-0 z-[320] h-px w-px overflow-visible"
        id={SETTA_POPOVER_PORTAL_PARENT_ID}
      />
    </>
  );
}

export function getHomeRailButtonColor(isActive: boolean): string {
  if (isActive) {
    return "text-blue-500";
  }
  return "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500";
}

export function toggleHomeWorkspacePaneVisibility() {
  togglePaneVisibility(PaneNameEnum.homeWorkspace);
}

export function toggleHomeSelectedProjectPaneVisibility() {
  togglePaneVisibility(PaneNameEnum.homeSelectedProject);
}

export function HomeLeftIconRail({
  workspacePaneVisible,
  isDeploymentMode,
}: {
  workspacePaneVisible: boolean;
  isDeploymentMode: boolean;
}) {
  return (
    <div
      data-testid="home-left-icon-rail"
      className={`${HOME_SIDE_RAIL_CLASS_NAME} left-0 border-r border-setta-200/75 dark:border-setta-850`}
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-left-rail-workspace-toggle"
        className={`focus-visible:ring-light-blue-500 flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(workspacePaneVisible)}`}
        onClick={toggleHomeWorkspacePaneVisibility}
        aria-label="Toggle workspace browser pane"
      >
        <TbFolder size={18} />
      </button>
      {!isDeploymentMode && (
        <Link
          to={SETTINGS_ROUTER_PATH}
          state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
          data-testid="home-left-rail-settings-link"
          className={`focus-visible:ring-light-blue-500 mb-1 mt-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(false)}`}
          aria-label="Open settings"
        >
          <IoSettingsOutline size={18} />
        </Link>
      )}
    </div>
  );
}

export function HomeRightIconRail({
  selectedProjectPaneVisible,
}: {
  selectedProjectPaneVisible: boolean;
}) {
  return (
    <div
      data-testid="home-right-icon-rail"
      className={`${HOME_SIDE_RAIL_CLASS_NAME} right-0 border-l border-setta-200/75 dark:border-setta-850`}
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-right-rail-selected-project-toggle"
        className={`focus-visible:ring-light-blue-500 flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(selectedProjectPaneVisible)}`}
        onClick={toggleHomeSelectedProjectPaneVisibility}
        aria-label="Toggle selected project pane"
      >
        <TbListDetails size={18} />
      </button>
    </div>
  );
}
