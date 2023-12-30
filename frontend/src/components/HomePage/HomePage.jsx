import { dbDeleteProjects } from "dbRequests/projects";
import {
  createAndGoToProject,
  useGetProjectsForHomePage,
} from "hooks/useGetOrCreateProjects";
import { matchSorter } from "match-sorter";
import { useSearch } from "models/search";
import { forwardRef, useEffect, useState } from "react";
import { BiGitBranch, BiPlus } from "react-icons/bi";
import { IoMdCheckmark } from "react-icons/io";
import { IoClose } from "react-icons/io5";
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

  const stdbtnStyles =
    "py-2 px-4 rounded-full font-bold font-heading text-white bg-runcoder-600  hover:bg-blue-500 gap-2";

  const closebtnStyles =
    "py-2 px-4 rounded-full font-medium font-heading text-white/75 bg-runcoder-500/25 hover:bg-red-500 hover:text-white gap-2";

  return (
    <div className="overflow-y-auto px-10 py-8">
      <div className="flex gap-4">
        <StandardButton twClasses={stdbtnStyles} onClick={onClick}>
          <BiPlus />
          New Project
        </StandardButton>
        <StandardButton twClasses={closebtnStyles} onClick={onClickDelete}>
          <IoClose />
          Delete
        </StandardButton>
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
  const searchValue = useSearch((x) => x.value);
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
      "relative grid grid-rows-[1fr_5rem] rounded-3xl border border-solid border-transparent min-h-[15rem] w-full overflow-hidden hover:transition-all hover:shadow-xl hover:cursor-pointer hover:border-white dark:hover:border-slate-600 gap-0";

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
          <div className="absolute bottom-0 top-0 left-0 col-start-1 col-end-2 row-start-2 row-end-3 w-full bg-white p-4 dark:bg-runcoder-800 ">
            <p className="overflow-hidden overflow-ellipsis whitespace-nowrap font-heading text-xs font-bold text-slate-600 dark:text-slate-300">
              {name}
            </p>
            <Badges name={name} />
          </div>
        </Link>
      </div>
    );
  }
);

function ThumbnailArea({
  onClickConfigsButton,
  project,
  configs,
  isSelected,
  onSelectProject,
}) {
  return (
    <div className="absolute top-0 left-0 bottom-0 col-start-1 col-end-2 row-start-1 row-end-2 grid w-full bg-slate-300 bg-center p-4 dark:bg-runcoder-600">
      <aside className="col-start-1 col-end-2 row-start-1 row-end-2 flex w-full items-center justify-between gap-1 [place-self:flex-start_flex-end]">
        <IconButton
          icon={<IoMdCheckmark />}
          color="text-white/50 hover:text-white"
          bg={`bg-runcoder-300/25 hover:bg-blue-500 ${
            isSelected ? "bg-blue-500" : ""
          }`}
          size="w-4 h-4"
          onClick={(e) => onSelectProject(e, project.id)}
        />
        <StandardDropdown
          trigger={
            <div
              className="flex items-center gap-1 rounded-full bg-slate-200 py-1 px-2 text-xs  hover:bg-slate-50 dark:bg-runcoder-700 dark:text-slate-300 dark:hover:bg-slate-500"
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
        svgStyles="fill-slate-200"
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

// BADGES

function Badges({ name }) {
  return (
    <div className="[background:linear-gradient(to right, rgba(255,255,255,0) 0%,rgba(255,255,255,1) 70%)] badgefade  mt-1 flex flex-row gap-[0.15rem]">
      <BadgeSwitch name={name} />
    </div>
  );
}
// appleOrchardFarm: scikit-learn, clustering
// diffusionDrops: stable-diffusion
// pytorchLightningMnist: toy-model, torchmetrics
// pytorchTraining: pytorch, image-classification
// simpleTrainTest: numpy

function BadgeSwitch({ name }) {
  switch (name) {
    case "appleOrchardFarm":
      return (
        <>
          <BadgeSciKit /> <BadgeClustering />
        </>
      );

    case "diffusionDrops":
      return (
        <>
          <BadgeSD />
        </>
      );

    case "pytorchLightningMnist":
      return (
        <>
          <BadgeTorchMetrics />
        </>
      );

    case "pytorchTraining":
      return (
        <>
          <BadgePyTorch /> <BadgeImageClassification />
        </>
      );

    case "simpleTrainTest":
      return (
        <>
          <BadgeNumPy />
        </>
      );

    default:
      return <></>;
  }
}

function BadgeSciKit() {
  return (
    <Badge twClasses="bg-cyan-100 dark:bg-cyan-800 text-cyan-800 dark:text-cyan-100 hover:bg-cyan-200">
      Scikit-Learn
    </Badge>
  );
}

function BadgePyTorch() {
  return (
    <Badge twClasses="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 hover:bg-red-200">
      PyTorch 2.9
    </Badge>
  );
}

function BadgeNumPy() {
  return (
    <Badge twClasses="bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100 hover:bg-green-200">
      NumPy
    </Badge>
  );
}
function BadgeML() {
  return (
    <Badge twClasses="bg-slate-100 dark:bg-runcoder-800 text-slate-800 dark:text-runcoder-100 hover:bg-slate-200">
      Machine Learning
    </Badge>
  );
}
function BadgeSD() {
  return (
    <Badge twClasses="bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-100 hover:bg-orange-200">
      Stable Diffusion
    </Badge>
  );
}
function BadgeClustering() {
  return (
    <Badge twClasses="bg-emerald-100 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100 hover:bg-emerald-200">
      Clustering
    </Badge>
  );
}
function BadgeTorchVision() {
  return (
    <Badge twClasses="bg-fuchsia-100 dark:bg-fuchsia-800 text-fuchsia-800 dark:text-fuchsia-100 hover:bg-fuchsia-200">
      Torch Vision
    </Badge>
  );
}
function BadgeTorchMetrics() {
  return (
    <Badge twClasses="bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-100 hover:bg-purple-200">
      Torch Metrics
    </Badge>
  );
}
function BadgeImageClassification() {
  return (
    <Badge twClasses="bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 hover:bg-blue-200">
      Image Classification
    </Badge>
  );
}
