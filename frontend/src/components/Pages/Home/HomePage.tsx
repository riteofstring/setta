import {
  FileBrowserFilter,
  FileBrowserPane,
} from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { GridWrapper } from "components/Utils/GridWrapper";
import { getNodesBounds } from "forks/xyflow/core/utils/graph";
import { getXYWidthHeight, MinimapSvg } from "forks/xyflow/minimap/MiniMap";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useEffect, useMemo, useState } from "react";
import { BiPlus } from "react-icons/bi";
import { HiHome } from "react-icons/hi";
import { IoMdCheckmark } from "react-icons/io";
import { IoClose, IoSettingsOutline } from "react-icons/io5";
import { LuPenLine } from "react-icons/lu";
import { Link, useNavigate } from "react-router-dom";
import { openDeleteProjectWarningModal } from "state/actions/modal";
import {
  loadAllProjectMetadata,
  useCreateAndGoToProjectConfig,
} from "state/actions/project/loadProject";
import {
  useAllProjectMetadata,
  useHomeFileBrowserState,
  useHomePageSearch,
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
  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();
  const selectionEnabled = !isDeploymentMode;
  const searchValue = useHomePageSearch((x) => x.value);

  const filteredProjects = useMemo(
    () => matchSorter(projects, searchValue, { keys: ["name"] }),
    [projects, searchValue],
  );

  useEffect(() => {
    if (isDeploymentMode) {
      setSelectedProjects([]);
    }
  }, [isDeploymentMode]);

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
      const selected = filteredProjects.find((x) => x.id === selectedProjects[0]);
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

  function onSelectProject(e: React.MouseEvent, projectConfigId: string) {
    if (!selectionEnabled) {
      return;
    }
    e.preventDefault(); // prevent navigation when multi-selecting
    setActiveProjectId(projectConfigId);
    if (selectedProjects.includes(projectConfigId)) {
      setSelectedProjects(
        selectedProjects.filter((x) => x !== projectConfigId),
      );
    } else {
      setSelectedProjects([...selectedProjects, projectConfigId]);
    }
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

      <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(250px,_1fr)_minmax(420px,_1.6fr)_minmax(260px,_1fr)]">
        <HomeFileBrowserColumn />
        <section
          className="flex min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-3 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
          data-testid="home-project-gallery"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
              Project Configs
            </h2>
            <span className="text-[10px] uppercase tracking-[0.14em] text-setta-400">
              {filteredProjects.length}
            </span>
          </div>
          <ProjectItems
            filteredProjects={filteredProjects}
            defaultProjectConfigId={defaultProjectConfigId}
            selectedProjects={selectedProjects}
            onSelectProject={onSelectProject}
            selectionEnabled={selectionEnabled}
            isDeploymentMode={isDeploymentMode}
            onActivateProject={setActiveProjectId}
          />
        </section>
        <SelectedProjectDetails
          project={selectedDetailProject}
          isDefault={selectedDetailProject?.id === defaultProjectConfigId}
          isDeploymentMode={isDeploymentMode}
        />
      </div>
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
      className="flex min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-3 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
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

function ProjectItems({
  filteredProjects,
  defaultProjectConfigId,
  selectedProjects,
  onSelectProject,
  selectionEnabled,
  isDeploymentMode,
  onActivateProject,
}: {
  filteredProjects: Array<ProjectConfig>;
  defaultProjectConfigId: string | null;
  selectedProjects: Array<string>;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  onActivateProject: (projectId: string) => void;
}) {
  const selectionMode = selectionEnabled && selectedProjects.length > 0;

  if (filteredProjects.length === 0) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-center">
          <LuPenLine className="mx-auto h-16 w-16 text-setta-200 dark:text-setta-700/50" />
          <p className="text-sm font-semibold text-setta-300 dark:text-setta-700">
            Create a New Config!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
      {filteredProjects.map((project, index) => (
        <ProjectItem
          project={project}
          isDefault={project.id === defaultProjectConfigId}
          key={`Project-${index}-${project.id}`}
          isSelected={selectedProjects.includes(project.id)}
          onSelectProject={onSelectProject}
          inSelectionMode={selectionMode}
          selectionEnabled={selectionEnabled}
          isDeploymentMode={isDeploymentMode}
          onActivate={() => onActivateProject(project.id)}
        />
      ))}
    </div>
  );
}

function ProjectItem({
  project,
  isDefault,
  isSelected,
  onSelectProject,
  inSelectionMode,
  selectionEnabled,
  isDeploymentMode,
  onActivate,
}: {
  project: ProjectConfig;
  isDefault: boolean;
  isSelected: boolean;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  inSelectionMode: boolean;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
  onActivate: () => void;
}) {
  const itemStyles =
    "relative grid grid-rows-[1fr_min-content] min-h-[13rem] w-full overflow-hidden rounded-2xl border border-solid border-transparent bg-white/75 shadow-sm transition-all hover:cursor-pointer hover:border-white hover:shadow-xl dark:bg-setta-900/40 dark:hover:border-setta-600";
  const projectPath = resolveProjectPath(project.name, isDeploymentMode);

  return (
    <article className={itemStyles} data-testid="home-project-card">
      <ThumbnailWrapper
        project={project}
        inSelectionMode={inSelectionMode}
        onSelectProject={onSelectProject}
        projectPath={projectPath}
        selectionEnabled={selectionEnabled}
        onActivate={onActivate}
      >
        <ThumbnailArea
          project={project}
          isSelected={isSelected}
          onSelectProject={onSelectProject}
          projectPath={projectPath}
          selectionEnabled={selectionEnabled}
          onActivate={onActivate}
        />
        <div className="col-start-1 col-end-2 row-start-2 row-end-3 w-full place-self-end bg-white px-4 py-3 dark:bg-setta-860">
          <div className="flex items-center justify-between">
            <p className="truncate text-sm text-setta-600 dark:text-setta-100">
              {project.name}
            </p>
            {isDefault && (
              <HiHome className="h-4 w-4 text-setta-600 dark:text-setta-100" />
            )}
          </div>
        </div>
      </ThumbnailWrapper>
    </article>
  );
}

function ThumbnailWrapper({
  project,
  inSelectionMode,
  onSelectProject,
  projectPath,
  selectionEnabled,
  onActivate,
  children,
}: {
  project: ProjectConfig;
  inSelectionMode: boolean;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  projectPath: string | null;
  selectionEnabled: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  if (!inSelectionMode && projectPath) {
    return (
      <Link
        to={projectPath}
        state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
        className="contents"
        relative="path"
        onMouseEnter={onActivate}
        onFocus={onActivate}
      >
        {children}
      </Link>
    );
  }

  if (!selectionEnabled) {
    return (
      <div className="contents" onMouseEnter={onActivate}>
        {children}
      </div>
    );
  }

  return (
    <div
      className="contents"
      onMouseEnter={onActivate}
      onClick={(e: React.MouseEvent) => onSelectProject(e, project.id)}
    >
      {children}
    </div>
  );
}

function ThumbnailArea({
  project,
  isSelected,
  onSelectProject,
  projectPath,
  selectionEnabled,
  onActivate,
}: {
  project: ProjectConfig;
  isSelected: boolean;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  projectPath: string | null;
  selectionEnabled: boolean;
  onActivate: () => void;
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
    <div
      className={`absolute bottom-0 left-0 top-0 col-start-1 col-end-2 row-start-1 row-end-2 grid w-full bg-center p-4 ${project.previewImgColor}`}
      onMouseEnter={onActivate}
    >
      <aside className="z-[10] col-start-1 col-end-2 row-start-1 row-end-2 flex w-full items-center justify-between gap-1 [place-self:flex-start_flex-end]">
        {selectionEnabled && (
          <button
            className={`nodrag flex inline-flex cursor-pointer items-center justify-center focus-visible:ring-2 ${isSelected ? "bg-blue-500" : "bg-black/20 hover:bg-blue-500"} h-4 w-4 rounded-full px-1 py-1 text-white/50 hover:text-white`}
            onClick={(e) => onSelectProject(e, project.id)}
          >
            <IoMdCheckmark />
          </button>
        )}
      </aside>

      <div
        className="col-start-1 col-end-2 row-start-1 row-end-2 -m-4 grid place-items-center overflow-hidden opacity-50 mix-blend-multiply [&>*]:scale-150"
        tabIndex={0}
        onKeyDown={onThumbnailKeyDown}
      >
        <PreviewImg topLevelSections={project.topLevelSections} />
      </div>
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
        className="flex min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
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
      className="flex min-h-0 flex-col rounded-2xl border border-setta-200/75 bg-white/75 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40"
      data-testid="home-selected-project-details"
    >
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-setta-400">
        Selected Project
      </h2>
      <div className="mb-3 overflow-hidden rounded-xl border border-setta-200/80 bg-setta-50/60 p-3 dark:border-setta-800/80 dark:bg-setta-900/50">
        <div
          className={`h-24 w-full rounded-lg ${project.previewImgColor} p-2 opacity-90`}
        >
          <div className="h-full w-full overflow-hidden rounded-md bg-white/30">
            <PreviewImg topLevelSections={project.topLevelSections} />
          </div>
        </div>
      </div>
      <div className="space-y-2 text-xs text-setta-600 dark:text-setta-300">
        <p className="truncate text-sm font-semibold text-setta-800 dark:text-setta-100">
          {project.name}
        </p>
        <p>
          Default: <span className="font-semibold">{isDefault ? "Yes" : "No"}</span>
        </p>
        <p>
          Sections: <span className="font-semibold">{project.topLevelSections.length}</span>
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

function resolveProjectPath(
  projectName: string,
  isDeploymentMode: boolean,
): string | null {
  if (!isDeploymentMode) {
    return pathRelativeToProject(projectName);
  }
  return buildSharePath(projectName);
}

function PreviewImg({
  topLevelSections,
}: {
  topLevelSections: ProjectConfig["topLevelSections"];
}) {
  const nodes = _.map(topLevelSections, (n) => ({
    position: { x: n.x, y: n.y },
    width: n.w,
    height: n.h,
  }));

  const elementWidth = 200;
  const elementHeight = 150;
  const boundingRect = getNodesBounds(nodes);
  const { x, y, width, height, offset } = getXYWidthHeight({
    boundingRect,
    elementHeight,
    elementWidth,
    offsetScale: 5,
  });

  return MinimapSvg({
    elementWidth: 200,
    elementHeight: 150,
    x,
    y,
    width,
    height,
    offset,
    nodes,
    nodeColor: (node) => {
      if (node.className?.includes("selected")) return "#ffffff";
      return "#d6dee8";
    },
    nodeBorderRadius: 2,
    nodeStrokeWidth: 2,
    nodeStrokeColor: "transparent",
    maskColor: "rgba(255,255,255,0.35)",
    maskStrokeColor: "transparent",
    maskStrokeWidth: 1,
    shapeRendering: "geometricPrecision",
  });
}
