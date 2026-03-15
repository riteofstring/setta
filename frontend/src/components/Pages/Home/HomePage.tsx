import { GridWrapper } from "components/Utils/GridWrapper";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useEffect, useMemo, useState } from "react";
import { BiPlus } from "react-icons/bi";
import { IoClose, IoSettingsOutline } from "react-icons/io5";
import { Link } from "react-router-dom";
import { openDeleteProjectWarningModal } from "state/actions/modal";
import {
  loadAllProjectMetadata,
  useCreateAndGoToProjectConfig,
} from "state/actions/project/loadProject";
import { useWindowSize } from "state/hooks/utils";
import { useProjectLoading } from "state/stores/projectStatusStores";
import { useHomePageSearch } from "state/stores/searchStores";
import {
  useAllProjectMetadata,
  useShareSession,
} from "state/stores/sessionStores";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  HOME_COMPACT_LAYOUT_BREAKPOINT_PX,
  PAGE_LOAD_TYPES,
  SETTA_POPOVER_PORTAL_PARENT_ID,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { router_set_as_default_project } from "utils/generatedEndpoints";
import type { ProjectConfig } from "utils/generatedTypes";

import { LoadingSpinner } from "../LoadingSpinner";
import { HomeProjectGallery } from "./homeProjectGallery";
import {
  HomeFileBrowserPane,
  HomeLeftIconRail,
  HomeRightIconRail,
  HomeSelectedProjectPane,
  resolveHomeMiddleInsetPx,
} from "./homeWorkspaceSidePanes";

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

export function shouldShowCompactHomeSettingsButton({
  isCompactLayout,
  isDeploymentMode,
}: {
  isCompactLayout: boolean;
  isDeploymentMode: boolean;
}): boolean {
  return isCompactLayout && !isDeploymentMode;
}

export function HomePage() {
  const { projectMetadata, defaultProjectConfigId } = useAllProjectMetadata(
    (state) => state,
    _.isEqual,
  );
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);
  const [hasLoadedProjectMetadata, setHasLoadedProjectMetadata] =
    useState(false);

  useEffect(() => {
    let isCancelled = false;
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

type HomeWorkspaceLayoutProps = {
  projects: Array<ProjectConfig>;
  defaultProjectConfigId: string | null;
  setIsCreatingConfig: (newVal: boolean) => void;
  isDeploymentMode: boolean;
  hasLoadedProjectMetadata: boolean;
};

// Owns home-page bootstrap, selection state, and layout decisions. Rendering
// surfaces live in the nearby `home*` modules.
function HomeWorkspaceLayout({
  projects,
  defaultProjectConfigId,
  setIsCreatingConfig,
  isDeploymentMode,
  hasLoadedProjectMetadata,
}: HomeWorkspaceLayoutProps) {
  const [selectedProjects, setSelectedProjects] = useState<Array<string>>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();
  const selectionEnabled = !isDeploymentMode;
  const searchValue = useHomePageSearch((state) => state.value);
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
    const activeExists = filteredProjects.some(
      (project) => project.id === activeProjectId,
    );
    if (!activeExists) {
      setActiveProjectId(filteredProjects[0]?.id ?? null);
    }
  }, [activeProjectId, filteredProjects]);

  const selectedDetailProject = useMemo(() => {
    if (selectedProjects.length > 0) {
      const selected = filteredProjects.find(
        (project) => project.id === selectedProjects[0],
      );
      if (selected) {
        return selected;
      }
      const fallback = projects.find(
        (project) => project.id === selectedProjects[0],
      );
      if (fallback) {
        return fallback;
      }
    }
    if (activeProjectId) {
      const active = filteredProjects.find(
        (project) => project.id === activeProjectId,
      );
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
        return previousProjects.filter((id) => id !== projectConfigId);
      }
      return [...previousProjects, projectConfigId];
    });
  }

  function onClickDelete() {
    openDeleteProjectWarningModal({
      selectedProjectsIdName: selectedProjects.map((projectId) => ({
        id: projectId,
        name: projects.find((project) => project.id === projectId)?.name ?? "",
      })),
    });
  }

  function onEscapeClearSelectedProjects(event: React.KeyboardEvent) {
    if (event.code === "Escape") {
      setSelectedProjects([]);
    }
  }

  async function onSetDefaultProject(projectConfigId: string) {
    await router_set_as_default_project({ projectConfigId });
  }

  const showSidePanes = !isCompactLayout;
  const middleInsetLeft = resolveHomeMiddleInsetPx({
    showSidePanes,
    paneVisible: homeWorkspacePaneVis,
    paneWidth: homeWorkspacePaneWidth,
  });
  const middleInsetRight = resolveHomeMiddleInsetPx({
    showSidePanes,
    paneVisible: homeSelectedProjectPaneVis,
    paneWidth: homeSelectedProjectPaneWidth,
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
        <HomeFileBrowserPane
          visible={homeWorkspacePaneVis}
          width={homeWorkspacePaneWidth}
        />
      )}
      {showSidePanes && (
        <HomeSelectedProjectPane
          visible={homeSelectedProjectPaneVis}
          width={homeSelectedProjectPaneWidth}
          project={selectedDetailProject}
          defaultProjectConfigId={defaultProjectConfigId}
          isDeploymentMode={isDeploymentMode}
        />
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
          <HomeProjectGallery
            favoriteProjects={favoriteProjects}
            nonFavoriteProjects={nonFavoriteProjects}
            totalProjectsCount={totalProjectsCount}
            defaultProjectConfigId={defaultProjectConfigId}
            selectedProjects={selectedProjects}
            onSelectProject={onSelectProject}
            onToggleProjectSelection={onToggleProjectSelection}
            selectionEnabled={selectionEnabled}
            isDeploymentMode={isDeploymentMode}
            activeProjectId={activeProjectId}
            onActivateProject={setActiveProjectId}
            onSetDefaultProject={onSetDefaultProject}
            galleryViewMode={homeProjectGalleryViewMode}
            fullScreenSurface
          />
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
