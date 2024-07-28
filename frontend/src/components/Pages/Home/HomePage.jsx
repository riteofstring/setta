import { NEW_PROJECT } from "components/Pages/pageLoadTypes";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { StandardButton } from "components/Utils/atoms/buttons/StandardButton";
import { GridWrapper } from "components/Utils/GridWrapper";
import { getNodesBounds } from "forks/xyflow/core";
import { getXYWidthHeight, MinimapSvg } from "forks/xyflow/minimap/MiniMap";
import { matchSorter } from "match-sorter";
import { forwardRef, useEffect, useState } from "react";
import { BiPlus } from "react-icons/bi";
import { IoMdCheckmark } from "react-icons/io";
import { IoClose, IoSettingsOutline } from "react-icons/io5";
import { Link } from "react-router-dom";
import { dbDeleteProjects } from "requests/projects";
import { createAndGoToProject } from "state/actions/project/loadProject";
import { useHomePageSearch } from "state/definitions";
import { useGetProjects } from "state/hooks/project";
import { SETTINGS_ROUTER_PATH } from "utils/constants";
import "./homepage.css";

export function HomePage() {
  const [doRefresh, setDoRefresh] = useState(true);
  const { projects, getProjects } = useGetProjects();

  useEffect(() => {
    if (doRefresh) {
      getProjects();
      setDoRefresh(false);
    }
  }, [doRefresh]);

  return (
    <GridWrapper gridStyles="bg-setta-100 dark:bg-setta-900">
      <RightColumn projects={projects} setDoRefresh={setDoRefresh} />
    </GridWrapper>
  );
}

function RightColumn({ projects, setDoRefresh }) {
  const [selectedProjects, setSelectedProjects] = useState([]);

  async function onClick() {
    await createAndGoToProject({});
  }

  function onSelectProject(e, projectId) {
    e.preventDefault();
    if (selectedProjects.includes(projectId)) {
      setSelectedProjects(selectedProjects.filter((x) => x !== projectId));
    } else {
      setSelectedProjects([...selectedProjects, projectId]);
    }
  }

  async function onClickDelete() {
    const res = await dbDeleteProjects({ ids: selectedProjects });
    if (res.status === 200) {
      setDoRefresh(true);
    }
  }

  return (
    <div className="overflow-y-auto px-10 py-8">
      <div className="flex justify-between gap-4">
        <div className="flex gap-4">
          <StandardButton
            twClasses="py-2 px-4 rounded-full font-bold font-heading text-white bg-setta-600  hover:bg-blue-500 gap-2"
            onClick={onClick}
          >
            <BiPlus />
            New Project
          </StandardButton>
          <StandardButton
            twClasses="py-2 px-4 rounded-full font-medium font-heading text-white/75 bg-setta-500/25 hover:bg-red-500 hover:text-white gap-2"
            onClick={onClickDelete}
          >
            <IoClose />
            Delete
          </StandardButton>
        </div>
        <Link
          to={SETTINGS_ROUTER_PATH}
          className="nodrag inline-flex cursor-pointer items-center gap-2 rounded-full bg-setta-600 px-4 py-2 font-heading font-bold text-white  hover:bg-blue-500 focus-visible:ring-2 "
        >
          <IoSettingsOutline />
          Settings
        </Link>
      </div>
      <ProjectItems
        projects={projects}
        selectedProjects={selectedProjects}
        onSelectProject={onSelectProject}
      />
    </div>
  );
}

function ProjectItems({ projects, selectedProjects, onSelectProject }) {
  const searchValue = useHomePageSearch((x) => x.value);
  const filteredProjects = matchSorter(projects, searchValue, {
    keys: ["name"],
  });

  const gridStyles =
    "grid grid-cols-[repeat(minmax(0, 1fr))] md:grid-cols-[repeat(auto-fit,_minmax(15rem,_1fr))] xl:grid-cols-[repeat(auto-fill,_minmax(20rem,_1fr))] gap-8 pt-7 justify-items-start";

  return (
    <div className={gridStyles}>
      {filteredProjects.map((x, i) => (
        <ProjectItem
          project={x}
          key={`Project ${i} ${x.name}`}
          isSelected={selectedProjects.includes(x.id)}
          onSelectProject={onSelectProject}
        />
      ))}
    </div>
  );
}

const ProjectItem = forwardRef(
  ({ project, isSelected, onSelectProject }, forwardedRef) => {
    const itemStyles =
      "relative grid grid-rows-[1fr_min-content] rounded-3xl border border-solid border-transparent min-h-[15rem] w-full overflow-hidden hover:transition-all hover:shadow-xl hover:cursor-pointer hover:border-white dark:hover:border-setta-600 gap-0";

    return (
      <div ref={forwardedRef} className={itemStyles}>
        <Link
          to={project.name}
          state={{ pageLoadType: NEW_PROJECT }}
          className="contents"
        >
          <ThumbnailArea
            project={project}
            isSelected={isSelected}
            onSelectProject={onSelectProject}
          />
          <div className="col-start-1 col-end-2 row-start-2 row-end-3 w-full place-self-end bg-white px-5 py-4 dark:bg-setta-800 ">
            <p className="font-heading text-sm text-setta-600 dark:text-setta-100">
              {project.name}
            </p>
          </div>
        </Link>
      </div>
    );
  },
);

function ThumbnailArea({ project, isSelected, onSelectProject }) {
  const previewImgNodes = JSON.parse(project.previewImgNodes);

  return (
    <div
      className={`absolute bottom-0 left-0 top-0 col-start-1 col-end-2 row-start-1 row-end-2 grid w-full bg-center p-4 ${project.previewImgColor}`}
    >
      <aside className="z-[1000] col-start-1 col-end-2 row-start-1 row-end-2 flex w-full items-center justify-between gap-1 [place-self:flex-start_flex-end]">
        <IconButton
          icon={<IoMdCheckmark />}
          color="text-white/50 hover:text-white"
          bg={isSelected ? "bg-blue-500" : "bg-black/20 hover:bg-blue-500"}
          size="w-4 h-4"
          onClick={(e) => onSelectProject(e, project.id)}
        />
      </aside>

      <div className="col-start-1 col-end-2 row-start-1 row-end-2 -m-4 grid place-items-center overflow-hidden opacity-50 mix-blend-multiply [&>*]:scale-150">
        <PreviewImg previewImgNodes={previewImgNodes} />
      </div>
    </div>
  );
}

function PreviewImg({ previewImgNodes }) {
  const nodes = previewImgNodes.map((n) => ({
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
