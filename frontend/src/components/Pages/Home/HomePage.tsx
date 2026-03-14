import { FileBrowserPane } from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { GridWrapper } from "components/Utils/GridWrapper";
import { PaneContainer } from "components/Utils/PaneContainer";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BiPlus } from "react-icons/bi";
import { IoClose, IoSettingsOutline } from "react-icons/io5";
import { TbFolder, TbListDetails } from "react-icons/tb";
import { Link } from "react-router-dom";
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
  useShareSession,
} from "state/definitions";
import { useWindowSize } from "state/hooks/utils";
import { useProjectLoading } from "state/stores/ephemeralUiStores";
import { useHomeFileBrowserState } from "state/stores/fileBrowserStores";
import {
  buildSharePath,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  PAGE_LOAD_TYPES,
  PaneNameEnum,
  pathRelativeToProject,
  SETTA_POPOVER_PORTAL_PARENT_ID,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { router_set_as_default_project } from "utils/generatedEndpoints";
import { ProjectConfig } from "utils/generatedTypes";
import { LoadingSpinner } from "../LoadingSpinner";
import { HomeProjectGallery } from "./HomeProjectGallery";
import {
  partitionProjectsByFavoriteStatus,
  reconcileFavoriteProjectConfigIds,
  reconcileSelectedHomeProjectIds,
  resolveActiveHomeProjectId,
  resolveHomeWorkspaceChromeState,
  resolveSelectedHomeProject,
  shouldApplyHomeFileBrowserPath,
  shouldUseCompactHomeLayout,
} from "./homeWorkspaceState";

const HOME_WORKSPACE_PANE_NAME = PaneNameEnum.homeWorkspace;
const HOME_SELECTED_PROJECT_PANE_NAME = PaneNameEnum.homeSelectedProject;
const HOME_MIN_PANE_WIDTH = 260;
const HOME_FILE_BROWSER_META_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";
const HOME_FILE_BROWSER_TITLE_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";
const HOME_ICON_RAIL_Z_INDEX_CLASS = "z-[31]";
const HOME_FILE_BROWSER_LIST_INSET_LEFT = 10;
const HOME_PANE_TITLE_CLASS =
  "mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500";
const HOME_FILE_BROWSER_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden";
const HOME_INSET_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-2";

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
    if (!hasLoadedProjectMetadata) {
      return;
    }
    const currentFavoriteIds =
      useLocalStorage.getState().favoriteProjectConfigIds;
    const nextFavoriteIds = reconcileFavoriteProjectConfigIds({
      projects,
      favoriteProjectConfigIds: currentFavoriteIds,
    });
    if (nextFavoriteIds.length !== currentFavoriteIds.length) {
      useLocalStorage.setState({ favoriteProjectConfigIds: nextFavoriteIds });
    }
  }, [hasLoadedProjectMetadata, projects]);

  useEffect(() => {
    setSelectedProjects((previousProjects) => {
      if (previousProjects.length === 0) {
        return previousProjects;
      }
      const nextSelectedProjects = reconcileSelectedHomeProjectIds({
        projects,
        selectedProjectIds: previousProjects,
      });
      if (nextSelectedProjects.length === previousProjects.length) {
        return previousProjects;
      }
      return nextSelectedProjects;
    });
  }, [projects]);

  useEffect(() => {
    const nextActiveProjectId = resolveActiveHomeProjectId({
      filteredProjects,
      activeProjectId,
    });
    if (nextActiveProjectId !== activeProjectId) {
      setActiveProjectId(nextActiveProjectId);
    }
  }, [activeProjectId, filteredProjects]);

  const selectedDetailProject = useMemo(() => {
    return resolveSelectedHomeProject({
      selectedProjectIds: selectedProjects,
      filteredProjects,
      projects,
      activeProjectId,
    });
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
  const {
    showSidePanes,
    middleInsetLeft,
    middleInsetRight,
    showCompactSettingsButton,
  } = useMemo(
    () =>
      resolveHomeWorkspaceChromeState({
        isCompactLayout,
        homeWorkspacePaneVis,
        homeWorkspacePaneWidth,
        homeSelectedProjectPaneVis,
        homeSelectedProjectPaneWidth,
        isDeploymentMode,
      }),
    [
      homeSelectedProjectPaneVis,
      homeSelectedProjectPaneWidth,
      homeWorkspacePaneVis,
      homeWorkspacePaneWidth,
      isCompactLayout,
      isDeploymentMode,
    ],
  );

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
      )}
      {showSidePanes && (
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
  const { homeWorkspacePaneVis } = useLocalStorage.getState();
  const nextVis = !homeWorkspacePaneVis;
  useLocalStorage.setState({
    homeWorkspacePaneVis: nextVis,
  });
}

function toggleHomeSelectedProjectPaneVisibility() {
  const { homeSelectedProjectPaneVis } = useLocalStorage.getState();
  const nextVis = !homeSelectedProjectPaneVis;
  useLocalStorage.setState({
    homeSelectedProjectPaneVis: nextVis,
  });
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
      className={`fixed left-0 ${HOME_ICON_RAIL_Z_INDEX_CLASS} flex w-10 flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900`}
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-left-rail-workspace-toggle"
        className={`focus-visible:ring-light-blue-500 flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(
          workspacePaneVisible,
        )}`}
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
          className={`focus-visible:ring-light-blue-500 mb-1 mt-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(
            false,
          )}`}
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
      className={`fixed right-0 ${HOME_ICON_RAIL_Z_INDEX_CLASS} flex w-10 flex-col items-center gap-1 border-l border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900`}
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-right-rail-selected-project-toggle"
        className={`focus-visible:ring-light-blue-500 flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(
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
          showSettaInitializedBadgePill={false}
          allowOutsideWorkspaceRoot
          metaPaddingClassName={HOME_FILE_BROWSER_META_INSET_CLASS}
          listInsetLeft={HOME_FILE_BROWSER_LIST_INSET_LEFT}
        />
      </div>
    </section>
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

  const projectPath = resolveProjectPath(project.name, isDeploymentMode);

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
