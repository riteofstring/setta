import { GridWrapper } from "components/AppContainer/GridWrapper/GridWrapper";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { matchSorter } from "match-sorter";
import { useAuth } from "models/auth";
import { useSearch } from "models/search";
import { forwardRef, useEffect, useState } from "react";
import { BiGitBranch, BiPlus } from "react-icons/bi";
import { Badge } from "utils/atoms/badges/badge";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { Item } from "utils/atoms/dropdown/item";
import { router } from "utils/Routes/router";
import "./homepage.css";
import { ThumbnailLogo } from "./Thumbnail/ThumbnailLogo";

export function HomePage() {
  const { projects, getProjects, createProject } = useGetOrCreateProjects();

  useEffect(() => {
    getProjects();
  }, []);

  return (
    <GridWrapper gridStyles="bg-slate-100">
      <RightColumn projects={projects} createProject={createProject} />
    </GridWrapper>
  );
}

function RightColumn({ projects, createProject }) {
  async function onClick() {
    const newProject = await createProject({ name: "NewProject" });
    goToDefaultConfig(newProject);
  }

  const stdbtnStyles =
    "py-2 px-4 rounded-full font-bold font-heading text-white bg-slate-600 border border-solid border-slate-300 hover:border-white hover:shadow-xl hover:bg-white hover:text-slate-900 gap-2";

  return (
    <div className="overflow-y-auto px-10 py-8">
      <div className="flex gap-4">
        <StandardButton twClasses={stdbtnStyles} onClick={onClick}>
          <BiPlus />
          New Project
        </StandardButton>
      </div>
      <ProjectItems projects={projects} />
    </div>
  );
}

function ProjectItems({ projects }) {
  const searchValue = useSearch((x) => x.value);
  const filteredProjects = matchSorter(Object.values(projects), searchValue, {
    keys: ["name"],
  });

  const gridStyles =
    "grid grid-cols-[repeat(minmax(0, 1fr))] md:grid-cols-[repeat(auto-fit,_minmax(15rem,_1fr))] xl:grid-cols-[repeat(auto-fill,_minmax(20rem,_1fr))] gap-8 pt-7 justify-items-start";

  return (
    <div className={gridStyles}>
      {filteredProjects.map((x, i) => (
        <ProjectItem project={x} key={`Project ${i} ${x.name}`} />
      ))}
    </div>
  );
}

const ProjectItem = forwardRef(({ project }, forwardedRef) => {
  const { name, configs } = project;
  const [openConfigs, setOpenConfigs] = useState(false);

  function onClick() {
    goToDefaultConfig(project);
  }

  function onClickConfigsButton(e) {
    e.stopPropagation();
    setOpenConfigs(!openConfigs);
  }

  function onConfigClick(e, configId) {
    e.stopPropagation();
    goToProject({ project, configId });
  }

  // bg-[url('https://via.placeholder.com/400')]

  const itemStyles =
    "relative grid grid-rows-[1fr_5rem] rounded-3xl border border-solid border-transparent min-h-[15rem] w-full overflow-hidden hover:transition-all hover:shadow-xl hover:cursor-pointer hover:border-white gap-0";

  return (
    <div onClick={onClick} ref={forwardedRef} className={itemStyles}>
      <ThumbnailArea
        onClickConfigsButton={onClickConfigsButton}
        configs={configs}
        onConfigClick={onConfigClick}
      />
      <div className="absolute bottom-0 top-0 left-0 col-start-1 col-end-2 row-start-2 row-end-3 w-full bg-white p-4 ">
        <p className="overflow-hidden overflow-ellipsis whitespace-nowrap font-heading text-xs font-bold text-slate-600">
          {name}
        </p>
        <Badges />
      </div>
    </div>
  );
});

function ThumbnailArea({ onClickConfigsButton, configs, onConfigClick }) {
  return (
    <div className="absolute top-0 left-0 bottom-0 col-start-1 col-end-2 row-start-1 row-end-2 grid w-full bg-slate-300 bg-center p-4">
      <StandardDropdown
        trigger={
          <div
            className="col-start-1 col-end-2 row-start-1 row-end-2 flex items-center gap-1 rounded-full bg-slate-200 py-1 px-2 text-xs [place-self:flex-start_flex-end] hover:bg-slate-50"
            onClick={onClickConfigsButton}
          >
            <BiGitBranch />
            Configs
          </div>
        }
        content={<Body configs={configs} onClick={onConfigClick} />}
        align="end"
      />
      <ThumbnailLogo
        styles="place-self-center w-7 col-start-1 col-end-2 row-start-1 row-end-2"
        svgStyles="fill-slate-200"
      />
    </div>
  );
}

function Body({ configs, onClick }) {
  return configs.map((x, idx) => (
    <Item
      className="flex flex-row"
      key={`Config ${idx}`}
      onClick={(e) => onClick(e, x.id)}
    >
      {x.name}
      <DefaultConfigBadge config={x} />
    </Item>
  ));
}

export function DefaultConfigBadge({ config }) {
  return (
    config.isDefault && (
      <Badge twClasses="bg-green-100 text-green-800">Default</Badge>
    )
  );
}

function Badges() {
  return (
    <div className="[background:linear-gradient(to right, rgba(255,255,255,0) 0%,rgba(255,255,255,1) 70%)] badgefade  mt-1 flex flex-row gap-[0.15rem]">
      <Badge twClasses="bg-green-100 text-green-800 hover:bg-green-200">
        PyTorch 2.9
      </Badge>
      <Badge twClasses="bg-red-100 text-red-800 hover:bg-red-200">NumPy</Badge>
      <Badge twClasses="bg-green-100 text-green-800 hover:bg-green-200">
        PyTorch 2.9
      </Badge>
      <Badge twClasses="bg-red-100 text-red-800 hover:bg-red-200">NumPy</Badge>
      <Badge twClasses="bg-green-100 text-green-800 hover:bg-green-200">
        PyTorch 2.9
      </Badge>
      <Badge twClasses="bg-red-100 text-red-800 hover:bg-red-200">NumPy</Badge>
      <Badge twClasses="bg-green-100 text-green-800 hover:bg-green-200">
        PyTorch 2.9
      </Badge>
      <Badge twClasses="bg-red-100 text-red-800 hover:bg-red-200">NumPy</Badge>
      <Badge twClasses="bg-green-100 text-green-800 hover:bg-green-200">
        PyTorch 2.9
      </Badge>
      <Badge twClasses="bg-red-100 text-red-800 hover:bg-red-200">NumPy</Badge>
    </div>
  );
}

function goToProject({ project, configId }) {
  const username = useAuth.getState().username;
  const configName = project.configs.find((x) => x.id === configId).name;
  const address = `${username}/${project.name}/${configName}`;
  router.navigate(address);
}

function goToDefaultConfig(project) {
  goToProject({
    project,
    configId: project.configs.find((x) => x.isDefault).id,
  });
}
