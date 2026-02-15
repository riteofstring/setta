import { GridWrapper } from "components/Utils/GridWrapper";
import { getNodesBounds } from "forks/xyflow/core/utils/graph";
import { getXYWidthHeight, MinimapSvg } from "forks/xyflow/minimap/MiniMap";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useEffect, useState } from "react";
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
        <RightColumn
          projects={projectMetadata}
          defaultProjectConfigId={defaultProjectConfigId}
          setIsCreatingConfig={setIsCreatingConfig}
          isDeploymentMode={isDeploymentMode}
        />
      )}
    </GridWrapper>
  );
}

function RightColumn({
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
  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();
  const selectionEnabled = !isDeploymentMode;

  useEffect(() => {
    if (isDeploymentMode) {
      setSelectedProjects([]);
    }
  }, [isDeploymentMode]);

  async function handleCreateConfig() {
    setIsCreatingConfig(true);
    await createAndGoToProjectConfig();
  }

  function onSelectProject(e: React.MouseEvent, projectConfigId: string) {
    if (!selectionEnabled) {
      return;
    }
    e.preventDefault(); // to prevent going into the project
    if (selectedProjects.includes(projectConfigId)) {
      setSelectedProjects(
        selectedProjects.filter((x) => x !== projectConfigId),
      );
    } else {
      setSelectedProjects([...selectedProjects, projectConfigId]);
    }
  }

  async function onClickDelete() {
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
    <div
      className="overflow-y-auto px-10 py-8"
      onKeyDown={onEscapeClearSelectedProjects}
    >
      <div className="flex justify-between gap-4">
        {isDeploymentMode ? (
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
            Sharing mode is read-only
          </div>
        ) : (
          <>
            <div className="flex gap-4">
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
      </div>
      <ProjectItems
        projects={projects}
        defaultProjectConfigId={defaultProjectConfigId}
        selectedProjects={selectedProjects}
        onSelectProject={onSelectProject}
        selectionEnabled={selectionEnabled}
        isDeploymentMode={isDeploymentMode}
      />
    </div>
  );
}

function ProjectItems({
  projects,
  defaultProjectConfigId,
  selectedProjects,
  onSelectProject,
  selectionEnabled,
  isDeploymentMode,
}: {
  projects: Array<ProjectConfig>;
  defaultProjectConfigId: string | null;
  selectedProjects: Array<string>;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
}) {
  const searchValue = useHomePageSearch((x) => x.value);
  const filteredProjects = matchSorter(projects, searchValue, {
    keys: ["name"],
  });
  const selectionMode = selectionEnabled && selectedProjects.length > 0;

  const gridStyles =
    "grid grid-cols-1 gap-8 pt-7 justify-items-start sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={gridStyles}>
      {filteredProjects.length === 0 ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
          <LuPenLine className="mx-auto h-32 w-32 text-setta-200 dark:text-setta-700/50" />
          <p className="text-center font-semibold text-setta-300 dark:text-setta-700">
            Create a New Config!
          </p>
        </div>
      ) : (
        filteredProjects.map((x, i) => (
          <ProjectItem
            project={x}
            isDefault={x.id === defaultProjectConfigId}
            key={`Project ${i} ${x.name}`}
            isSelected={selectedProjects.includes(x.id)}
            onSelectProject={onSelectProject}
            inSelectionMode={selectionMode}
            selectionEnabled={selectionEnabled}
            isDeploymentMode={isDeploymentMode}
          />
        ))
      )}
    </div>
  );
}

// Simplified ProjectItem component
function ProjectItem({
  project,
  isDefault,
  isSelected,
  onSelectProject,
  inSelectionMode,
  selectionEnabled,
  isDeploymentMode,
}: {
  project: ProjectConfig;
  isDefault: boolean;
  isSelected: boolean;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  inSelectionMode: boolean;
  selectionEnabled: boolean;
  isDeploymentMode: boolean;
}) {
  const itemStyles =
    "relative grid grid-rows-[1fr_min-content] rounded-3xl border border-solid border-transparent min-h-[15rem] w-full overflow-hidden hover:transition-all hover:shadow-xl hover:cursor-pointer hover:border-white dark:hover:border-setta-600 gap-0";
  const projectPath = resolveProjectPath(project.name, isDeploymentMode);

  return (
    <div className={itemStyles}>
      <ThumbnailWrapper
        project={project}
        inSelectionMode={inSelectionMode}
        onSelectProject={onSelectProject}
        projectPath={projectPath}
        selectionEnabled={selectionEnabled}
      >
        <ThumbnailArea
          project={project}
          isSelected={isSelected}
          onSelectProject={onSelectProject}
          projectPath={projectPath}
          selectionEnabled={selectionEnabled}
        />
        <div className="col-start-1 col-end-2 row-start-2 row-end-3 w-full place-self-end bg-white px-5 py-4 dark:bg-setta-860">
          <div className="flex items-center justify-between">
            <p className="text-sm text-setta-600 dark:text-setta-100">
              {project.name}
            </p>
            {isDefault && (
              <HiHome className="h-4 w-4 text-setta-600 dark:text-setta-100" />
            )}
          </div>
        </div>
      </ThumbnailWrapper>
    </div>
  );
}

function ThumbnailWrapper({
  project,
  inSelectionMode,
  onSelectProject,
  projectPath,
  selectionEnabled,
  children,
}: {
  project: ProjectConfig;
  inSelectionMode: boolean;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  projectPath: string | null;
  selectionEnabled: boolean;
  children: React.ReactNode;
}) {
  if (!inSelectionMode && projectPath) {
    return (
      <Link
        to={projectPath}
        state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
        className="contents"
        relative="path"
      >
        {children}
      </Link>
    );
  }

  if (!selectionEnabled) {
    return <div className="contents">{children}</div>;
  }

  return (
    <div
      className="contents"
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
}: {
  project: ProjectConfig;
  isSelected: boolean;
  onSelectProject: (e: React.MouseEvent, id: string) => void;
  projectPath: string | null;
  selectionEnabled: boolean;
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
    nodeColor: "#2D384D",
    nodeStrokeColor: "transparent",
    nodeBorderRadius: 5,
    nodeStrokeWidth: 2,
    nodeClassName: "",
    maskColor: "rgb(20, 22, 31, 0.5)",
    maskStrokeColor: "none",
    maskStrokeWidth: 1,
  });
}
