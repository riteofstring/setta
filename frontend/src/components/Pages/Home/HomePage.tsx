import {
  FileBrowserFilter,
  FileBrowserPane,
} from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { ProjectConfigThumbnailSurface } from "components/ProjectConfigs/ProjectConfigThumbnailSurface";
import { GridWrapper } from "components/Utils/GridWrapper";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { Resizable } from "re-resizable";
import { useEffect, useMemo, useRef, useState } from "react";
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
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { router_set_as_default_project } from "utils/generatedEndpoints";
import { ProjectConfig } from "utils/generatedTypes";
import { LoadingSpinner } from "../LoadingSpinner";

const HOME_MIN_LEFT_COLUMN_WIDTH = 250;
const HOME_MAX_LEFT_COLUMN_WIDTH = 520;
const HOME_MIN_RIGHT_COLUMN_WIDTH = 260;
const HOME_MAX_RIGHT_COLUMN_WIDTH = 540;
const HOME_MIN_MIDDLE_COLUMN_WIDTH = 420;
const HOME_DESKTOP_TOTAL_GAP_WIDTH = 32;
const HOME_PROJECT_CARD_GRID_TEMPLATE_COLUMNS =
  "repeat(auto-fill, minmax(10.5rem, 14rem))";

function clampToBounds(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getHomeMaxTotalSideWidth(desktopColumnsWidth: number): number {
  return Math.max(
    HOME_MIN_LEFT_COLUMN_WIDTH + HOME_MIN_RIGHT_COLUMN_WIDTH,
    desktopColumnsWidth -
      HOME_MIN_MIDDLE_COLUMN_WIDTH -
      HOME_DESKTOP_TOTAL_GAP_WIDTH,
  );
}

export function shouldClampHomeSideColumnWidths(
  isDesktopLayout: boolean,
  desktopColumnsWidth: number | null,
): boolean {
  return isDesktopLayout && desktopColumnsWidth !== null;
}

export function HomePage() {
  const { projectMetadata, defaultProjectConfigId } = useAllProjectMetadata(
    (x) => x,
    _.isEqual,
  );
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);

  useEffect(() => {
    // load manually on first load because websocket might take time to connect
    loadAllProjectMetadata();
    useProjectLoading.getState().reset();
  }, []);

  return (
    <GridWrapper gridStyles="bg-setta-100 dark:bg-setta-dark">
      {isCreatingConfig ? (
        <LoadingSpinner />
      ) : (
        <HomeWorkspaceLayout
          projects={projectMetadata}
          defaultProjectConfigId={defaultProjectConfigId}
          setIsCreatingConfig={setIsCreatingConfig}
          isDeploymentMode={isDeploymentMode}
        />
      )}
    </GridWrapper>
  );
}

function HomeWorkspaceLayout({
  projects,
  defaultProjectConfigId,
  setIsCreatingConfig,
  isDeploymentMode,
}: {
  projects: Array<ProjectConfig>;
  defaultProjectConfigId: string | null;
  setIsCreatingConfig: (newVal: boolean) => void;
  isDeploymentMode: boolean;
}) {
  const [selectedProjects, setSelectedProjects] = useState<Array<string>>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.innerWidth >= 1024;
  });
  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();
  const selectionEnabled = !isDeploymentMode;
  const searchValue = useHomePageSearch((x) => x.value);
  const {
    favoriteProjectConfigIds,
    homeProjectGalleryViewMode,
    homePageLeftColumnWidth,
    homePageRightColumnWidth,
  } = useLocalStorage(
    (state) => ({
      favoriteProjectConfigIds: state.favoriteProjectConfigIds,
      homeProjectGalleryViewMode: state.homeProjectGalleryViewMode,
      homePageLeftColumnWidth: state.homePageLeftColumnWidth,
      homePageRightColumnWidth: state.homePageRightColumnWidth,
    }),
    _.isEqual,
  );
  const desktopColumnsRef = useRef<HTMLDivElement | null>(null);
  const [desktopColumnsWidth, setDesktopColumnsWidth] = useState<number | null>(
    null,
  );
  const [leftColumnWidth, setLeftColumnWidth] = useState<number>(() =>
    clampToBounds(
      homePageLeftColumnWidth,
      HOME_MIN_LEFT_COLUMN_WIDTH,
      HOME_MAX_LEFT_COLUMN_WIDTH,
    ),
  );
  const [rightColumnWidth, setRightColumnWidth] = useState<number>(() =>
    clampToBounds(
      homePageRightColumnWidth,
      HOME_MIN_RIGHT_COLUMN_WIDTH,
      HOME_MAX_RIGHT_COLUMN_WIDTH,
    ),
  );

  const filteredProjects = useMemo(
    () => matchSorter(projects, searchValue, { keys: ["name"] }),
    [projects, searchValue],
  );
  const favoriteIdSet = useMemo(
    () => new Set(favoriteProjectConfigIds),
    [favoriteProjectConfigIds],
  );
  const favoriteProjects = useMemo(
    () => filteredProjects.filter((project) => favoriteIdSet.has(project.id)),
    [filteredProjects, favoriteIdSet],
  );
  const nonFavoriteProjects = useMemo(
    () => filteredProjects.filter((project) => !favoriteIdSet.has(project.id)),
    [filteredProjects, favoriteIdSet],
  );

  useEffect(() => {
    if (isDeploymentMode) {
      setSelectedProjects([]);
    }
  }, [isDeploymentMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onResize = () => {
      setIsDesktopLayout(window.innerWidth >= 1024);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    setLeftColumnWidth((previousWidth) => {
      const nextWidth = clampToBounds(
        homePageLeftColumnWidth,
        HOME_MIN_LEFT_COLUMN_WIDTH,
        HOME_MAX_LEFT_COLUMN_WIDTH,
      );
      if (previousWidth === nextWidth) {
        return previousWidth;
      }
      return nextWidth;
    });
  }, [homePageLeftColumnWidth]);

  useEffect(() => {
    setRightColumnWidth((previousWidth) => {
      const nextWidth = clampToBounds(
        homePageRightColumnWidth,
        HOME_MIN_RIGHT_COLUMN_WIDTH,
        HOME_MAX_RIGHT_COLUMN_WIDTH,
      );
      if (previousWidth === nextWidth) {
        return previousWidth;
      }
      return nextWidth;
    });
  }, [homePageRightColumnWidth]);

  useEffect(() => {
    if (!isDesktopLayout) {
      setDesktopColumnsWidth(null);
      return;
    }
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const target = desktopColumnsRef.current;
    if (!target) {
      return;
    }
    const updateWidth = () => {
      setDesktopColumnsWidth(target.clientWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [isDesktopLayout]);

  useEffect(() => {
    const validProjectIds = new Set(projects.map((project) => project.id));
    const currentFavoriteIds =
      useLocalStorage.getState().favoriteProjectConfigIds;
    const nextFavoriteIds = currentFavoriteIds.filter((id) =>
      validProjectIds.has(id),
    );
    if (nextFavoriteIds.length !== currentFavoriteIds.length) {
      useLocalStorage.setState({ favoriteProjectConfigIds: nextFavoriteIds });
    }
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
      setSelectedProjects,
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

  async function onClickMakeDefault() {
    const projectConfigId = selectedProjects[0];
    if (!projectConfigId) {
      return;
    }
    await router_set_as_default_project({ projectConfigId });
  }

  const maxTotalSideWidth =
    desktopColumnsWidth === null
      ? null
      : getHomeMaxTotalSideWidth(desktopColumnsWidth);
  const leftColumnMaxWidth =
    maxTotalSideWidth === null
      ? HOME_MAX_LEFT_COLUMN_WIDTH
      : Math.min(
          HOME_MAX_LEFT_COLUMN_WIDTH,
          Math.max(
            HOME_MIN_LEFT_COLUMN_WIDTH,
            maxTotalSideWidth - rightColumnWidth,
          ),
        );
  const rightColumnMaxWidth =
    maxTotalSideWidth === null
      ? HOME_MAX_RIGHT_COLUMN_WIDTH
      : Math.min(
          HOME_MAX_RIGHT_COLUMN_WIDTH,
          Math.max(
            HOME_MIN_RIGHT_COLUMN_WIDTH,
            maxTotalSideWidth - leftColumnWidth,
          ),
        );

  useEffect(() => {
    if (
      !shouldClampHomeSideColumnWidths(isDesktopLayout, desktopColumnsWidth)
    ) {
      return;
    }
    const nextMaxTotalSideWidth = getHomeMaxTotalSideWidth(desktopColumnsWidth);
    let nextLeftWidth = clampToBounds(
      leftColumnWidth,
      HOME_MIN_LEFT_COLUMN_WIDTH,
      HOME_MAX_LEFT_COLUMN_WIDTH,
    );
    let nextRightWidth = clampToBounds(
      rightColumnWidth,
      HOME_MIN_RIGHT_COLUMN_WIDTH,
      HOME_MAX_RIGHT_COLUMN_WIDTH,
    );

    if (nextLeftWidth + nextRightWidth > nextMaxTotalSideWidth) {
      let overflowWidth =
        nextLeftWidth + nextRightWidth - nextMaxTotalSideWidth;
      const rightShrinkCapacity = Math.max(
        0,
        nextRightWidth - HOME_MIN_RIGHT_COLUMN_WIDTH,
      );
      const rightWidthReduction = Math.min(overflowWidth, rightShrinkCapacity);
      nextRightWidth -= rightWidthReduction;
      overflowWidth -= rightWidthReduction;
      if (overflowWidth > 0) {
        nextLeftWidth = Math.max(
          HOME_MIN_LEFT_COLUMN_WIDTH,
          nextLeftWidth - overflowWidth,
        );
      }
    }

    if (nextLeftWidth !== leftColumnWidth) {
      setLeftColumnWidth(nextLeftWidth);
    }
    if (nextRightWidth !== rightColumnWidth) {
      setRightColumnWidth(nextRightWidth);
    }
  }, [desktopColumnsWidth, isDesktopLayout, leftColumnWidth, rightColumnWidth]);

  function updateLeftColumnWidth(rawWidth: number, persistWidth: boolean) {
    const nextWidth = clampToBounds(
      rawWidth,
      HOME_MIN_LEFT_COLUMN_WIDTH,
      leftColumnMaxWidth,
    );
    setLeftColumnWidth(nextWidth);
    if (persistWidth) {
      useLocalStorage.setState({
        homePageLeftColumnWidth: nextWidth,
      });
    }
  }

  function updateRightColumnWidth(rawWidth: number, persistWidth: boolean) {
    const nextWidth = clampToBounds(
      rawWidth,
      HOME_MIN_RIGHT_COLUMN_WIDTH,
      rightColumnMaxWidth,
    );
    setRightColumnWidth(nextWidth);
    if (persistWidth) {
      useLocalStorage.setState({
        homePageRightColumnWidth: nextWidth,
      });
    }
  }

  const commonGalleryProps = {
    favoriteProjects,
    nonFavoriteProjects,
    defaultProjectConfigId,
    selectedProjects,
    onSelectProject,
    onToggleProjectSelection,
    selectionEnabled,
    isDeploymentMode,
    activeProjectId,
    onActivateProject: setActiveProjectId,
    onToggleFavoriteProjectConfig: toggleFavoriteProjectConfig,
    galleryViewMode: homeProjectGalleryViewMode,
  };

  return (
    <main
      className="flex h-full min-h-0 flex-col px-4 py-4 sm:px-6 sm:py-5"
      onKeyDown={onEscapeClearSelectedProjects}
      data-testid="home-file-manager-layout"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {isDeploymentMode ? (
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
            Sharing mode is read-only
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                className="nodrag inline-flex cursor-pointer items-center gap-2 rounded-full bg-setta-600 px-4 py-2 font-bold text-white hover:bg-blue-500 focus-visible:ring-2 dark:hover:bg-blue-700"
                onClick={handleCreateConfig}
              >
                <BiPlus />
                New Config
              </button>
              <button
                className="nodrag inline-flex cursor-pointer items-center gap-2 rounded-full bg-setta-400 px-4 py-2 font-medium text-white hover:!bg-green-500 hover:text-white focus-visible:ring-2 dark:bg-setta-500/25 dark:text-white/75 dark:hover:!bg-green-700"
                onClick={onClickMakeDefault}
                disabled={selectedProjects.length !== 1}
              >
                <HiHome />
                Make Default
              </button>
              <button
                className="nodrag inline-flex cursor-pointer items-center gap-2 rounded-full bg-setta-400 px-4 py-2 font-medium text-white hover:!bg-red-500 hover:text-white focus-visible:ring-2 dark:bg-setta-500/25 dark:text-white/75"
                onClick={onClickDelete}
                disabled={selectedProjects.length === 0}
              >
                <IoClose />
                Delete
              </button>
            </div>
            <Link
              to={SETTINGS_ROUTER_PATH}
              state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
              className="nodrag inline-flex cursor-pointer items-center gap-2 rounded-full bg-setta-600 px-4 py-2 font-bold text-white hover:bg-blue-500 focus-visible:ring-2 dark:hover:bg-blue-700"
            >
              <IoSettingsOutline />
              Settings
            </Link>
          </>
        )}
      </header>

      {isDesktopLayout ? (
        <div ref={desktopColumnsRef} className="flex h-full min-h-0 gap-4">
          <Resizable
            className="h-full shrink-0"
            size={{ width: leftColumnWidth, height: "100%" }}
            minWidth={HOME_MIN_LEFT_COLUMN_WIDTH}
            maxWidth={leftColumnMaxWidth}
            boundsByDirection
            enable={{
              top: false,
              right: true,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            handleComponent={{
              right: (
                <div
                  data-testid="home-left-column-resize-handle"
                  className="h-full w-2 cursor-col-resize bg-transparent hover:bg-blue-500/20"
                />
              ),
            }}
            onResize={(_event, _direction, elementRef) => {
              updateLeftColumnWidth(elementRef.offsetWidth, false);
            }}
            onResizeStop={(_event, _direction, elementRef) => {
              updateLeftColumnWidth(elementRef.offsetWidth, true);
            }}
          >
            <HomeFileBrowserColumn />
          </Resizable>

          <HomeProjectGallery {...commonGalleryProps} />

          <Resizable
            className="ml-auto h-full shrink-0"
            size={{ width: rightColumnWidth, height: "100%" }}
            minWidth={HOME_MIN_RIGHT_COLUMN_WIDTH}
            maxWidth={rightColumnMaxWidth}
            boundsByDirection
            enable={{
              top: false,
              right: false,
              bottom: false,
              left: true,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            handleComponent={{
              left: (
                <div
                  data-testid="home-right-column-resize-handle"
                  className="h-full w-2 cursor-col-resize bg-transparent hover:bg-blue-500/20"
                />
              ),
            }}
            onResize={(_event, _direction, elementRef) => {
              updateRightColumnWidth(elementRef.offsetWidth, false);
            }}
            onResizeStop={(_event, _direction, elementRef) => {
              updateRightColumnWidth(elementRef.offsetWidth, true);
            }}
          >
            <SelectedProjectDetails
              project={selectedDetailProject}
              isDefault={selectedDetailProject?.id === defaultProjectConfigId}
              isDeploymentMode={isDeploymentMode}
            />
          </Resizable>
        </div>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-1 gap-4">
          <HomeFileBrowserColumn />
          <HomeProjectGallery {...commonGalleryProps} />
          <SelectedProjectDetails
            project={selectedDetailProject}
            isDefault={selectedDetailProject?.id === defaultProjectConfigId}
            isDeploymentMode={isDeploymentMode}
          />
        </div>
      )}
    </main>
  );
}

function HomeFileBrowserColumn() {
  const rootPath = useHomeFileBrowserState((state) => state.rootPath);
  const [pathInput, setPathInput] = useState("");

  useEffect(() => {
    if (!rootPath) {
      return;
    }
    setPathInput(rootPath);
  }, [rootPath]);

  function applyPath() {
    const nextPath = pathInput.trim();
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
    <section
      className="flex h-full min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-3 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
      data-testid="home-file-browser-column"
    >
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
        Workspace Browser
      </h2>
      <div className="mb-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            data-testid="home-file-browser-path-input"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyPath();
              }
            }}
            placeholder="/path/to/workspace"
            className="h-8 min-w-0 flex-1 rounded-md border border-setta-200 bg-white px-2 text-xs text-setta-700 outline-none ring-0 placeholder:text-setta-300 focus:border-blue-500 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:placeholder:text-setta-600"
          />
          <button
            type="button"
            className="h-8 rounded-md border border-setta-200 bg-white px-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={applyPath}
          >
            Go
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <FileBrowserFilter
            useFileBrowserStateHook={useHomeFileBrowserState}
            className="h-8"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <FileBrowserPane
          useFileBrowserStateHook={useHomeFileBrowserState}
          showFilter={false}
          includeSettaInitializedFolders
        />
      </div>
    </section>
  );
}

function HomeProjectGallery({
  favoriteProjects,
  nonFavoriteProjects,
  defaultProjectConfigId,
  selectedProjects,
  onSelectProject,
  onToggleProjectSelection,
  selectionEnabled,
  isDeploymentMode,
  activeProjectId,
  onActivateProject,
  onToggleFavoriteProjectConfig,
  galleryViewMode,
}: {
  favoriteProjects: Array<ProjectConfig>;
  nonFavoriteProjects: Array<ProjectConfig>;
  defaultProjectConfigId: string | null;
  selectedProjects: Array<string>;
  onSelectProject: (id: string) => void;
  onToggleProjectSelection: (id: string) => void;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  activeProjectId: string | null;
  onActivateProject: (projectId: string) => void;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  galleryViewMode: "thumbnails" | "list";
}) {
  const allProjects = [...favoriteProjects, ...nonFavoriteProjects];

  if (allProjects.length === 0) {
    return (
      <section
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-3 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
        data-testid="home-project-gallery"
      >
        <div className="grid flex-1 place-items-center">
          <div className="text-center">
            <LuPenLine className="mx-auto h-16 w-16 text-setta-200 dark:text-setta-700/50" />
            <p className="text-sm font-semibold text-setta-300 dark:text-setta-700">
              Create a New Config!
            </p>
          </div>
        </div>
      </section>
    );
  }

  const inSelectionMode = selectionEnabled && selectedProjects.length > 0;

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-3 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
      data-testid="home-project-gallery"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
          Project Configs
        </h2>
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
          <span className="ml-1 text-[10px] uppercase tracking-[0.14em] text-setta-400">
            {allProjects.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
              />
            )}
          </ProjectGallerySection>
        )}

        <ProjectGallerySection
          title={
            favoriteProjects.length > 0
              ? "All Project Configs"
              : "Project Configs"
          }
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
}: {
  title: string;
  children: React.ReactNode;
  dataTestId?: string;
}) {
  return (
    <section className="mb-3 last:mb-0" data-testid={dataTestId}>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400">
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
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
  compactGrid?: boolean;
  dataTestId?: string;
}) {
  if (projects.length === 0) {
    return (
      <p className="rounded border border-dashed border-setta-200 px-2 py-3 text-xs text-setta-400 dark:border-setta-800 dark:text-setta-500">
        No project configs in this section.
      </p>
    );
  }
  const gridClassName = compactGrid
    ? "grid min-h-0 justify-start gap-3"
    : "grid min-h-0 justify-start gap-4";
  const gridStyle = {
    gridTemplateColumns: HOME_PROJECT_CARD_GRID_TEMPLATE_COLUMNS,
  };

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
          onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
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
  onToggleFavoriteProjectConfig,
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
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
}) {
  const navigate = useNavigate();
  const itemStyles = isActive
    ? "relative grid grid-rows-[1fr_min-content] min-h-[13rem] w-full max-w-[14rem] overflow-hidden rounded-2xl border border-blue-500/55 bg-blue-50/50 transition-colors dark:border-blue-500/45 dark:bg-blue-950/20"
    : "relative grid grid-rows-[1fr_min-content] min-h-[13rem] w-full max-w-[14rem] overflow-hidden rounded-2xl border border-setta-200/85 bg-setta-50/65 transition-colors hover:border-setta-300 dark:border-setta-700 dark:bg-setta-900/35 dark:hover:border-setta-600";
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
        onActivate={onActivate}
      >
        <ThumbnailArea
          project={project}
          isSelected={isSelected}
          onToggleProjectSelection={onToggleProjectSelection}
          projectPath={projectPath}
          selectionEnabled={selectionEnabled}
          isFavorite={isFavorite}
          onToggleFavoriteProjectConfig={onToggleFavoriteProjectConfig}
        />
        <div className="col-start-1 col-end-2 row-start-2 row-end-3 w-full place-self-end bg-white px-4 py-3 dark:bg-setta-860">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-setta-600 dark:text-setta-100">
              {project.name}
            </p>
            <div className="flex items-center gap-1">
              {isDefault && (
                <HiHome className="h-4 w-4 text-setta-600 dark:text-setta-100" />
              )}
              {isFavorite ? (
                <IoStar className="h-4 w-4 text-amber-400" />
              ) : (
                <IoStarOutline className="h-4 w-4 text-setta-300 dark:text-setta-600" />
              )}
            </div>
          </div>
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
  onActivate,
  children,
}: {
  project: ProjectConfig;
  onSelectProject: (id: string) => void;
  onOpenProject: () => void;
  projectPath: string | null;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="contents"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={() => onSelectProject(project.id)}
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
  selectionEnabled,
  isFavorite,
  onToggleFavoriteProjectConfig,
}: {
  project: ProjectConfig;
  isSelected: boolean;
  onToggleProjectSelection: (id: string) => void;
  projectPath: string | null;
  selectionEnabled: boolean;
  isFavorite: boolean;
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
}) {
  const navigate = useNavigate();

  function onThumbnailKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.code !== "Space") {
      return;
    }
    if (!projectPath) {
      return;
    }
    event.preventDefault();
    navigate(projectPath);
  }

  return (
    <ProjectConfigThumbnailSurface
      previewImgColor={project.previewImgColor}
      topLevelSections={project.topLevelSections}
      className="absolute bottom-0 left-0 top-0"
      previewContainerProps={{ tabIndex: 0, onKeyDown: onThumbnailKeyDown }}
      overlay={
        <aside className="z-[10] col-start-1 col-end-2 row-start-1 row-end-2 flex w-full items-center justify-between gap-1 [place-self:flex-start_flex-end]">
          {selectionEnabled && (
            <button
              className={`nodrag inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full px-1 py-1 text-white/80 focus-visible:ring-2 ${
                isSelected ? "bg-blue-500" : "bg-black/20 hover:bg-blue-500"
              }`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleProjectSelection(project.id);
              }}
            >
              <IoMdCheckmark />
            </button>
          )}
          <button
            type="button"
            data-testid="home-project-favorite-toggle"
            className={`nodrag inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full focus-visible:ring-2 ${
              isFavorite
                ? "bg-amber-500/85 text-white hover:bg-amber-400"
                : "bg-black/20 text-white/85 hover:bg-amber-500 hover:text-white"
            }`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavoriteProjectConfig(project.id);
            }}
            aria-label={
              isFavorite ? "Remove from favourites" : "Add to favourites"
            }
          >
            {isFavorite ? <IoStar size={12} /> : <IoStarOutline size={12} />}
          </button>
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
  onToggleFavoriteProjectConfig: (projectConfigId: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <p className="rounded border border-dashed border-setta-200 px-2 py-3 text-xs text-setta-400 dark:border-setta-800 dark:text-setta-500">
        No project configs in this section.
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
  const isRowInteractive = true;

  function onRowClick(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    onSelectProject(project.id);
  }

  function onRowDoubleClick() {
    if (!projectPath) {
      return;
    }
    navigate(projectPath, {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }

  function onRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onSelectProject(project.id);
  }

  return (
    <div
      data-testid="home-project-list-row"
      className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses} cursor-default`}
      onMouseEnter={onActivate}
      onClick={onRowClick}
      onDoubleClick={onRowDoubleClick}
      onKeyDown={onRowKeyDown}
      role={isRowInteractive ? "button" : undefined}
      tabIndex={isRowInteractive ? 0 : -1}
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
          aria-label={isSelected ? "Unselect config" : "Select config"}
        >
          <IoMdCheckmark size={10} />
        </button>
      )}
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {isDefault && (
        <HiHome className="h-4 w-4 text-setta-500 dark:text-setta-300" />
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
}: {
  project: ProjectConfig | null;
  isDefault: boolean;
  isDeploymentMode: boolean;
}) {
  if (!project) {
    return (
      <aside
        className="flex h-full min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
        data-testid="home-selected-project-details"
      >
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
          Selected Project
        </h2>
        <p className="text-sm text-setta-500 dark:text-setta-400">
          No project selected.
        </p>
      </aside>
    );
  }

  const projectPath = resolveProjectPath(project.name, isDeploymentMode);

  return (
    <aside
      className="flex h-full min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
      data-testid="home-selected-project-details"
    >
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
        Selected Project
      </h2>
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
          className="mt-auto inline-flex h-8 items-center justify-center rounded-md bg-blue-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:ring-2"
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
