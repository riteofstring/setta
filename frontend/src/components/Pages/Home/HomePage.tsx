import { HomePageSearchBar } from "components/AppHeader/SearchBar/HomePageSearch";
import { FileBrowserPane } from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { togglePaneVisibility } from "components/Panes/paneLayout";
import { ProjectConfigThumbnailSurface } from "components/ProjectConfigs/ProjectConfigThumbnailSurface";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { GridWrapper } from "components/Utils/GridWrapper";
import { PaneContainer } from "components/Utils/PaneContainer";
import { withRightPaneTitleClearance } from "components/Utils/paneTitleSpacing";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { setAsDefaultProject } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BiPlus } from "react-icons/bi";
import { FiGrid, FiList } from "react-icons/fi";
import { HiHome } from "react-icons/hi";
import { IoMdCheckmark } from "react-icons/io";
import {
  IoClose,
  IoSettingsOutline,
  IoStar,
  IoStarOutline,
} from "react-icons/io5";
import { LuPenLine } from "react-icons/lu";
import { TbFolder, TbListDetails } from "react-icons/tb";
import { Link, type NavigateFunction, useNavigate } from "react-router-dom";
import {
  setHomeProjectGalleryViewMode,
  toggleFavoriteProjectConfig,
} from "state/actions/localStorage";
import { openDeleteProjectWarningModal } from "state/actions/modal";
import {
  loadAllProjectMetadata,
  useCreateAndGoToProjectConfig,
} from "state/actions/project/loadProject";
import {
  useAllProjectMetadata,
  useHomeFileBrowserState,
  useHomePageSearch,
  useLocalStorage,
  useProjectLoading,
  useShareSession,
} from "state/definitions";
import { useWindowSize } from "state/hooks/utils";
import {
  APP_CHROME_Z_INDEX_CLASS_NAME,
  buildSharePath,
  CLOSED_PANE_WIDTH,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  HOME_COMPACT_LAYOUT_BREAKPOINT_PX,
  PAGE_LOAD_TYPES,
  PaneNameEnum,
  pathRelativeToProject,
  SETTA_POPOVER_PORTAL_PARENT_ID,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import {
  type ProjectConfig,
  type ProjectConfigMetadata,
} from "utils/generatedTypes";
import { LoadingSpinner } from "../LoadingSpinner";
const HOME_MIN_PANE_WIDTH = 260;
const HOME_PROJECT_CARD_GRID_TEMPLATE_COLUMNS =
  "repeat(auto-fill, minmax(10.5rem, 14rem))";
const HOME_FILE_BROWSER_META_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";
const HOME_FILE_BROWSER_TITLE_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";
const HOME_FILE_BROWSER_LIST_INSET_LEFT = 10;
const HOME_PANE_TITLE_CLASS =
  "mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500";
const HOME_FILE_BROWSER_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden";
const HOME_INSET_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-2";
const HOME_SIDE_RAIL_CLASS_NAME = `${APP_CHROME_Z_INDEX_CLASS_NAME} fixed flex w-10 flex-col items-center gap-1 bg-setta-50 py-2 dark:bg-setta-900`;
const HOME_RIGHT_PANE_TITLE_CLASS_NAME = withRightPaneTitleClearance(
  HOME_PANE_TITLE_CLASS,
);
const HOME_PROJECT_GALLERY_CLASS_NAMES = {
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
type HomeProject = ProjectConfigMetadata &
  Partial<Pick<ProjectConfig, "previewImgColor" | "topLevelSections">>;
function shouldUseCompactHomeLayout(winWidth: number | undefined): boolean {
  if (typeof winWidth === "number") {
    return winWidth < HOME_COMPACT_LAYOUT_BREAKPOINT_PX;
  }
  if (typeof window !== "undefined") {
    return window.innerWidth < HOME_COMPACT_LAYOUT_BREAKPOINT_PX;
  }
  return false;
}
function shouldApplyHomeFileBrowserPath({
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
function partitionProjectsByFavoriteStatus({
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
function getHomeProjectConfigsSectionTitle(hasFavorites: boolean): string {
  if (hasFavorites) {
    return "Other Projects";
  }
  return "All Projects";
}
function shouldOpenProjectOnListRowSpace(selectionEnabled: boolean): boolean {
  return !selectionEnabled;
}
function shouldShowCompactHomeSettingsButton({
  isCompactLayout,
  isDeploymentMode,
}: {
  isCompactLayout: boolean;
  isDeploymentMode: boolean;
}): boolean {
  return isCompactLayout && !isDeploymentMode;
}
function getNextActiveProjectId({
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
function resolveSelectedProjectDetails({
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
function syncStoredFavoriteProjectIds({
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
function filterValidSelectedProjectIds(
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
function selectSingleProjectId(
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
function toggleSelectedProjectId(
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
function getDeleteProjectTargets({
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
function getHomePaneInset({
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
function getHomeProjectGalleryClassNames(fullScreenSurface: boolean) {
  return HOME_PROJECT_GALLERY_CLASS_NAMES[
    fullScreenSurface ? "fullScreen" : "default"
  ];
}
function navigateToProjectPath({
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
function handleProjectThumbnailKeyDown({
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
function handleProjectListRowKeyDown({
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
function shouldShowSelectedProjectOpenLink({
  isDeploymentMode,
  projectPath,
}: {
  isDeploymentMode: boolean;
  projectPath: string | null;
}) {
  return Boolean(projectPath) && !isDeploymentMode;
}
function getSelectedProjectDetailsContainerClassName(
  hideTitle: boolean,
): string {
  if (hideTitle) {
    return "setta-pane-scroll flex h-full min-h-0 flex-col gap-2 text-xs text-setta-600 dark:text-setta-300";
  }
  return "flex h-full min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40";
}
function getProjectThumbnailSurfaceProps(project: HomeProject): {
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
function HomeWorkspaceHeader({
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
function HomeWorkspaceLayout({
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
    try {
      await createAndGoToProjectConfig();
    } finally {
      setIsCreatingConfig(false);
    }
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
function getHomeRailButtonColor(isActive: boolean): string {
  if (isActive) {
    return "text-blue-500";
  }
  return "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500";
}
function toggleHomeWorkspacePaneVisibility() {
  togglePaneVisibility(PaneNameEnum.homeWorkspace);
}
function toggleHomeSelectedProjectPaneVisibility() {
  togglePaneVisibility(PaneNameEnum.homeSelectedProject);
}
function HomeLeftIconRail({
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
function HomeRightIconRail({
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
function HomeFileBrowserColumn() {
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
function HomeProjectGallery({
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
function ProjectListSelectionButton({
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
function ProjectListDefaultButton({
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
function ProjectListFavoriteButton({
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
function SelectedProjectDetailsTitle() {
  return (
    <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
      Selected Project
    </h2>
  );
}
function SelectedProjectOpenLink({
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
function SelectedProjectDetails({
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
function getProjectTopLevelSectionCount(
  project: Pick<HomeProject, "topLevelSections">,
): number | null {
  if (!project.topLevelSections) {
    return null;
  }
  return Object.keys(project.topLevelSections).length;
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
