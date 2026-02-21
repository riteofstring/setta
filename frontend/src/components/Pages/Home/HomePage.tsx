import { FileBrowserPane } from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { ProjectConfigThumbnailSurface } from "components/ProjectConfigs/ProjectConfigThumbnailSurface";
import { HomePageSearchBar } from "components/AppHeader/SearchBar/HomePageSearch";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { GridWrapper } from "components/Utils/GridWrapper";
import { PaneContainer } from "components/Utils/PaneContainer";
import _ from "lodash";
import { matchSorter } from "match-sorter";
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
import { Link, useNavigate } from "react-router-dom";
import { TbFolder, TbListDetails } from "react-icons/tb";
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
import {
  buildSharePath,
  CLOSED_PANE_WIDTH,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { router_set_as_default_project } from "utils/generatedEndpoints";
import { ProjectConfig } from "utils/generatedTypes";
import { LoadingSpinner } from "../LoadingSpinner";

const HOME_WORKSPACE_PANE_NAME = "homeWorkspacePane";
const HOME_SELECTED_PROJECT_PANE_NAME = "homeSelectedProjectPane";
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

export function partitionProjectsByFavoriteStatus({
  projects,
  favoriteProjectConfigIds,
}: {
  projects: Array<ProjectConfig>;
  favoriteProjectConfigIds: Set<string>;
}): {
  favoriteProjects: Array<ProjectConfig>;
  nonFavoriteProjects: Array<ProjectConfig>;
  totalProjectsCount: number;
} {
  const favoriteProjects: Array<ProjectConfig> = [];
  const nonFavoriteProjects: Array<ProjectConfig> = [];
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

function HomeWorkspaceLayout({
  projects,
  defaultProjectConfigId,
  setIsCreatingConfig,
  isDeploymentMode,
  hasLoadedProjectMetadata,
}: {
  projects: Array<ProjectConfig>;
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
    if (!hasLoadedProjectMetadata) {
      return;
    }
    const validProjectIds = new Set(projects.map((project) => project.id));
    const currentFavoriteIds =
      useLocalStorage.getState().favoriteProjectConfigIds;
    const nextFavoriteIds = currentFavoriteIds.filter((id) =>
      validProjectIds.has(id),
    );
    if (nextFavoriteIds.length !== currentFavoriteIds.length) {
      useLocalStorage.setState({ favoriteProjectConfigIds: nextFavoriteIds });
    }
  }, [hasLoadedProjectMetadata, projects]);

  useEffect(() => {
    const validProjectIds = new Set(projects.map((project) => project.id));
    setSelectedProjects((previousProjects) => {
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
    });
  }, [projects]);

  useEffect(() => {
    if (filteredProjects.length === 0) {
      setActiveProjectId(null);
      return;
    }
    const activeExists = filteredProjects.some((x) => x.id === activeProjectId);
    if (!activeExists) {
      setActiveProjectId(filteredProjects[0]?.id ?? null);
    }
  }, [activeProjectId, filteredProjects]);

  const selectedDetailProject = useMemo(() => {
    if (selectedProjects.length > 0) {
      const selected = filteredProjects.find(
        (x) => x.id === selectedProjects[0],
      );
      if (selected) {
        return selected;
      }
      const fallback = projects.find((x) => x.id === selectedProjects[0]);
      if (fallback) {
        return fallback;
      }
    }
    if (activeProjectId) {
      const active = filteredProjects.find((x) => x.id === activeProjectId);
      if (active) {
        return active;
      }
    }
    return filteredProjects[0] ?? null;
  }, [activeProjectId, filteredProjects, projects, selectedProjects]);

  async function handleCreateConfig() {
    setIsCreatingConfig(true);
    await createAndGoToProjectConfig();
  }

  function onSelectProject(projectConfigId: string) {
    setActiveProjectId(projectConfigId);
    if (!selectionEnabled) {
      return;
    }
    setSelectedProjects((previousProjects) => {
      if (
        previousProjects.length === 1 &&
        previousProjects[0] === projectConfigId
      ) {
        return previousProjects;
      }
      return [projectConfigId];
    });
  }

  function onToggleProjectSelection(projectConfigId: string) {
    if (!selectionEnabled) {
      return;
    }
    setActiveProjectId(projectConfigId);
    setSelectedProjects((previousProjects) => {
      if (previousProjects.includes(projectConfigId)) {
        return previousProjects.filter((x) => x !== projectConfigId);
      }
      return [...previousProjects, projectConfigId];
    });
  }

  function onClickDelete() {
    openDeleteProjectWarningModal({
      selectedProjectsIdName: selectedProjects.map((s) => ({
        id: s,
        name: projects.find((p) => p.id === s)?.name ?? "",
      })),
    });
  }

  function onEscapeClearSelectedProjects(e: React.KeyboardEvent) {
    if (e.code === "Escape") {
      setSelectedProjects([]);
    }
  }

  async function onSetDefaultProject(projectConfigId: string) {
    await router_set_as_default_project({ projectConfigId });
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
  const middleInsetLeft = homeWorkspacePaneVis
    ? homeWorkspacePaneWidth
    : CLOSED_PANE_WIDTH;
  const middleInsetRight = homeSelectedProjectPaneVis
    ? homeSelectedProjectPaneWidth
    : CLOSED_PANE_WIDTH;

  return (
    <>
      <HomeLeftIconRail workspacePaneVisible={homeWorkspacePaneVis} />
      <HomeRightIconRail
        selectedProjectPaneVisible={homeSelectedProjectPaneVis}
      />
      <PaneContainer
        paneName={HOME_WORKSPACE_PANE_NAME}
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
      <PaneContainer
        paneName={HOME_SELECTED_PROJECT_PANE_NAME}
        right={true}
        minimumWidth={HOME_MIN_PANE_WIDTH}
        vis={homeSelectedProjectPaneVis}
        width={homeSelectedProjectPaneWidth}
      >
        {homeSelectedProjectPaneVis && (
          <section className={HOME_INSET_PANE_CONTENT_CLASS}>
            <h2 className={HOME_PANE_TITLE_CLASS}>Selected Project</h2>
            <SelectedProjectDetails
              project={selectedDetailProject}
              isDefault={selectedDetailProject?.id === defaultProjectConfigId}
              isDeploymentMode={isDeploymentMode}
              hideTitle
            />
          </section>
        )}
      </PaneContainer>
      <GridWrapper gridStyles="bg-setta-100 dark:bg-setta-dark">
        <main
          className="relative z-0 flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-x border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950"
          style={{ paddingLeft: middleInsetLeft, paddingRight: middleInsetRight }}
          onKeyDown={onEscapeClearSelectedProjects}
          data-testid="home-file-manager-layout"
        >
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
                <button
                  className="nodrag inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-setta-300 bg-white px-3 text-xs font-semibold text-setta-700 transition-colors hover:border-setta-400 hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-100 dark:hover:border-setta-600 dark:hover:bg-setta-900"
                  onClick={handleCreateConfig}
                >
                  <BiPlus />
                  New Project
                </button>
                <button
                  className="nodrag inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-setta-300 bg-white px-3 text-xs font-semibold text-setta-700 transition-colors hover:border-red-500 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-55 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-100 dark:hover:border-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-200"
                  onClick={onClickDelete}
                  disabled={selectedProjects.length === 0}
                >
                  <IoClose />
                  Delete
                </button>
              </div>
            )}
          </header>
          <HomeProjectGallery {...commonGalleryProps} fullScreenSurface />
        </main>
      </GridWrapper>
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
  const { homeWorkspacePaneVis, homeWorkspacePaneWidth } =
    useLocalStorage.getState();
  const nextVis = !homeWorkspacePaneVis;
  useLocalStorage.setState({
    homeWorkspacePaneVis: nextVis,
    homeWorkspacePaneTrueWidth: nextVis
      ? homeWorkspacePaneWidth
      : CLOSED_PANE_WIDTH,
  });
}

function toggleHomeSelectedProjectPaneVisibility() {
  const { homeSelectedProjectPaneVis, homeSelectedProjectPaneWidth } =
    useLocalStorage.getState();
  const nextVis = !homeSelectedProjectPaneVis;
  useLocalStorage.setState({
    homeSelectedProjectPaneVis: nextVis,
    homeSelectedProjectPaneTrueWidth: nextVis
      ? homeSelectedProjectPaneWidth
      : CLOSED_PANE_WIDTH,
  });
}

function HomeLeftIconRail({
  workspacePaneVisible,
}: {
  workspacePaneVisible: boolean;
}) {
  return (
    <div
      data-testid="home-left-icon-rail"
      className="fixed left-0 z-[19] flex w-10 flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900"
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-left-rail-workspace-toggle"
        className={`flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500 ${getHomeRailButtonColor(
          workspacePaneVisible,
        )}`}
        onClick={toggleHomeWorkspacePaneVisibility}
        aria-label="Toggle workspace browser pane"
      >
        <TbFolder size={18} />
      </button>
      <Link
        to={SETTINGS_ROUTER_PATH}
        state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
        data-testid="home-left-rail-settings-link"
        className={`mt-auto mb-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500 ${getHomeRailButtonColor(
          false,
        )}`}
        aria-label="Open settings"
      >
        <IoSettingsOutline size={18} />
      </Link>
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
      className="fixed right-0 z-[19] flex w-10 flex-col items-center gap-1 border-l border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900"
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-right-rail-selected-project-toggle"
        className={`flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500 ${getHomeRailButtonColor(
          selectedProjectPaneVisible,
        )}`}
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
    if (!nextPath) {
      return;
    }
    useHomeFileBrowserState.setState({
      rootPath: nextPath,
      selectedPath: nextPath,
      expandedPaths: { [nextPath]: true },
    });
  }

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col pb-2 [&_[data-testid='setta-initialized-badge']]:hidden [&_[data-testid='setta-initialized-folder-icon']]:text-blue-500 dark:[&_[data-testid='setta-initialized-folder-icon']]:text-blue-400">
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
              onBlur={applyPath}
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
            onClick={applyPath}
          >
            Go
          </button>
        </div>
      </div>
      <div className="min-h-[220px] min-w-0 flex-1">
        <FileBrowserPane
          useFileBrowserStateHook={useHomeFileBrowserState}
          includeSettaInitializedFolders
          allowOutsideWorkspaceRoot
          metaPaddingClassName={HOME_FILE_BROWSER_META_INSET_CLASS}
          listInsetLeft={HOME_FILE_BROWSER_LIST_INSET_LEFT}
        />
      </div>
    </section>
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
      <section className={gallerySurfaceClassName} data-testid="home-project-gallery">
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
    <section className={gallerySurfaceClassName} data-testid="home-project-gallery">
      <div className={galleryHeaderClassName}>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
          Projects
        </h2>
        <div className="flex min-w-0 flex-1 justify-center">
          <HomePageSearchBar
            className={`${HOME_FILE_BROWSER_TITLE_INSET_CLASS} max-w-sm`}
          />
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

  function onThumbnailKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
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

  function onRowClick(event: React.MouseEvent<HTMLDivElement>) {
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

  function onRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
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
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
            isSelected
              ? "bg-blue-500 text-white"
              : "bg-setta-200 text-transparent"
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

function SelectedProjectDetails({
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
      <aside className={containerClassName} data-testid="home-selected-project-details">
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

  const projectPath = resolveProjectPath(project.name, isDeploymentMode);

  return (
    <aside className={containerClassName} data-testid="home-selected-project-details">
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
            {getProjectTopLevelSectionCount(project)}
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

export function getProjectTopLevelSectionCount(project: ProjectConfig): number {
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
