import { dbDeleteProjects } from "dbRequests/projects";
import {
  createAndGoToProject,
  useGetProjectsForHomePage,
} from "hooks/useGetOrCreateProjects";
import { matchSorter } from "match-sorter";
import { useHomePageSearch } from "models/useHomePageSearch";
import { forwardRef, useEffect, useState } from "react";
import { BiGitBranch, BiPlus } from "react-icons/bi";
import { IoMdCheckmark } from "react-icons/io";
import { IoClose, IoSettingsOutline } from "react-icons/io5";
import { Link } from "react-router-dom";
import { Badge } from "utils/atoms/badges/badge";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { Item } from "utils/atoms/dropdown/item";
import { NEW_PROJECT } from "utils/Routes/pageLoadTypes";
import { GridWrapper } from "utils/Wrappers/GridWrapper";
import "./homepage.css";
import { ThumbnailLogo } from "./Thumbnail/ThumbnailLogo";

export function HomePage() {
  const [doRefresh, setDoRefresh] = useState(true);
  const { projects, getProjects } = useGetProjectsForHomePage();

  useEffect(() => {
    if (doRefresh) {
      getProjects();
      setDoRefresh(false);
    }
  }, [doRefresh]);

  return (
    <GridWrapper gridStyles="bg-rcbg-light dark:bg-rcbg-dark">
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
            twClasses="py-2 px-4 rounded-full font-bold font-heading text-white bg-runcoder-600  hover:bg-blue-500 gap-2"
            onClick={onClick}
          >
            <BiPlus />
            New Project
          </StandardButton>
          <StandardButton
            twClasses="py-2 px-4 rounded-full font-medium font-heading text-white/75 bg-runcoder-500/25 hover:bg-red-500 hover:text-white gap-2"
            onClick={onClickDelete}
          >
            <IoClose />
            Delete
          </StandardButton>
        </div>
        <Link to="settings">
          <StandardButton twClasses="py-2 px-4 rounded-full font-medium font-heading text-white/75 bg-runcoder-500/25 hover:bg-blue-500 hover:text-white gap-2">
            <IoSettingsOutline />
            Settings
          </StandardButton>
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
    const { name, configs } = project;
    const [openConfigs, setOpenConfigs] = useState(false);
    const defaultConfigAddress = useDefaultConfigAddress(project);

    function onClickConfigsButton(e) {
      e.stopPropagation();
      setOpenConfigs(!openConfigs);
    }

    // bg-[url('https://via.placeholder.com/400')]

    const itemStyles =
      "relative grid grid-rows-[1fr_5rem] rounded-3xl border border-solid border-transparent min-h-[15rem] w-full overflow-hidden hover:transition-all hover:shadow-xl hover:cursor-pointer hover:border-white dark:hover:border-runcoder-600 gap-0";

    return (
      <div ref={forwardedRef} className={itemStyles}>
        <Link to={defaultConfigAddress} state={{ pageLoadType: NEW_PROJECT }}>
          <ThumbnailArea
            onClickConfigsButton={onClickConfigsButton}
            project={project}
            configs={configs}
            isSelected={isSelected}
            onSelectProject={onSelectProject}
          />
          <div className="absolute bottom-0 left-0 top-0 col-start-1 col-end-2 row-start-2 row-end-3 w-full bg-white p-4 dark:bg-runcoder-800 ">
            <p className="overflow-hidden overflow-ellipsis whitespace-nowrap font-heading text-xs font-bold text-runcoder-600 dark:text-runcoder-300">
              {name}
            </p>
          </div>
        </Link>
      </div>
    );
  },
);

function ThumbnailArea({
  onClickConfigsButton,
  project,
  configs,
  isSelected,
  onSelectProject,
}) {
  return (
    <div className="absolute bottom-0 left-0 top-0 col-start-1 col-end-2 row-start-1 row-end-2 grid w-full bg-runcoder-300 bg-center p-4 dark:bg-runcoder-600">
      <aside className="col-start-1 col-end-2 row-start-1 row-end-2 flex w-full items-center justify-between gap-1 [place-self:flex-start_flex-end]">
        <IconButton
          icon={<IoMdCheckmark />}
          color="text-white/50 hover:text-white"
          bg={
            isSelected ? "bg-blue-500" : "bg-runcoder-300/25 hover:bg-blue-500"
          }
          size="w-4 h-4"
          onClick={(e) => onSelectProject(e, project.id)}
        />
        <StandardDropdown
          trigger={
            <div
              className="flex items-center gap-1 rounded-full bg-runcoder-200 px-2 py-1 text-xs  hover:bg-runcoder-50 dark:bg-runcoder-700 dark:text-runcoder-300 dark:hover:bg-runcoder-500"
              onClick={onClickConfigsButton}
            >
              <BiGitBranch />
              Configs
            </div>
          }
          content={<Body project={project} configs={configs} />}
          align="end"
        />
      </aside>

      <ThumbnailLogo
        styles="place-self-center w-7 col-start-1 col-end-2 row-start-1 row-end-2"
        svgStyles="fill-runcoder-200"
      />
    </div>
  );
}

function Body({ project, configs }) {
  return configs.map((x, idx) => (
    <ConfigItem project={project} config={x} key={`Config ${idx}`} />
  ));
}

function ConfigItem({ project, config }) {
  const configAddress = useConfigAddress({ project, configId: config.id });
  return (
    <Link to={configAddress} state={{ pageLoadType: NEW_PROJECT }}>
      <Item className="flex flex-row">
        {config.name}
        <DefaultConfigBadge isDefault={project.defaultConfigId === config.id} />
      </Item>
    </Link>
  );
}

function DefaultConfigBadge({ isDefault }) {
  return (
    isDefault && (
      <Badge twClasses="bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100">
        Default
      </Badge>
    )
  );
}

function useConfigAddress({ project, configId }) {
  const configName = project.configs.find((x) => x.id === configId).name;
  return `${project.name}/${configName}`;
}

function useDefaultConfigAddress(project) {
  const configId = project.defaultConfigId;
  return useConfigAddress({ project, configId });
}
