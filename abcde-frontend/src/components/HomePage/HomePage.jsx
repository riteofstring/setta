import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import React, { forwardRef, useEffect, useState } from "react";
import { BiGitBranch, BiPlus } from "react-icons/bi";
import Badge from "utils/atoms/badges/badge";
import { Button } from "utils/atoms/buttons/Button";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { Item } from "utils/atoms/dropdown/item";
import { CodeGenPopover } from "utils/atoms/popover/codegenpopover";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { router } from "utils/Routes/router";
import "./homepage.css";

function HomePage() {
  const { projects, getProjects, createProject } = useGetOrCreateProjects();

  useEffect(() => {
    getProjects();
  }, []);

  return (
    <GridWrapper gridStyles="bg-gray-100">
      <RightColumn projects={projects} createProject={createProject} />
    </GridWrapper>
  );
}

export default React.memo(HomePage);

function RightColumn({ projects, createProject }) {
  function onClick(name) {
    createProject({ name });
  }

  const inputStyles =
    "flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300 max-w-[30rem] focus-visible:border-blue-300 pl-7 py-1";
  const stdbtnStyles =
    "py-2 px-4 rounded-full font-bold font-heading text-white bg-gray-600 border border-solid border-gray-300 hover:border-white hover:shadow-xl hover:bg-white hover:text-gray-900 gap-2";
  const gridStyles =
    "grid grid-cols-[repeat(minmax(0, 1fr))] md:grid-cols-[repeat(auto-fit,_minmax(15rem,_1fr))] xl:grid-cols-[repeat(auto-fill,_minmax(20rem,_1fr))] gap-8 pt-7 justify-items-start";

  return (
    <div className="overflow-y-auto px-10 py-8">
      <div className="flex gap-4">
        <CodeGenPopover
          trigger={
            <StandardButton twClasses={stdbtnStyles}>
              <BiPlus />
              New Project
            </StandardButton>
          }
          body={<ProjectNameSetter onClick={onClick} />}
        />
        <StandardSearch
          inputStyles={inputStyles}
          leftElementStyles="pl-1"
          aria-label="Overview Search"
        />
      </div>

      <div className={gridStyles}>
        {Object.values(projects).map((x, i) => (
          <ProjectItem project={x} key={`Project ${i} ${x.name}`} />
        ))}
      </div>
    </div>
  );
}
const ProjectItem = forwardRef((props, forwardedRef) => {
  const { name, configs, defaultConfigId } = props.project;
  const [openConfigs, setOpenConfigs] = useState(false);

  function goToProject(configId) {
    const configName = configs.find((x) => x.id === configId).name;
    const address = `${name}/${configName}`;
    router.navigate(address);
  }

  function onClick() {
    goToProject(defaultConfigId);
  }

  function onClickConfigsButton(e) {
    e.stopPropagation();
    setOpenConfigs(!openConfigs);
  }

  function onConfigClick(e, configId) {
    e.stopPropagation();
    goToProject(configId);
  }

  // bg-[url('https://via.placeholder.com/400')]

  const itemStyles =
    "relative grid grid-rows-[1fr_5rem] rounded-3xl border border-solid border-transparent min-h-[15rem] w-full overflow-hidden hover:transition-all hover:shadow-xl hover:cursor-pointer hover:border-white gap-0";

  return (
    <div onClick={onClick} ref={forwardedRef} className={itemStyles}>
      <ThumbnailArea
        onClickConfigsButton={onClickConfigsButton}
        configs={configs}
        defaultConfigId={defaultConfigId}
        onConfigClick={onConfigClick}
      />
      <div className="absolute bottom-0 top-0 left-0 w-full p-4 row-start-2 row-end-3 col-start-1 col-end-2 bg-white ">
        <h3 className="font-bold font-heading text-gray-600 overflow-hidden overflow-ellipsis whitespace-nowrap text-xs">
          {name}
        </h3>
        <Badges />
      </div>
    </div>
  );
});

function ThumbnailArea({
  onClickConfigsButton,
  configs,
  defaultConfigId,
  onConfigClick,
}) {
  return (
    <div className="absolute top-0 left-0 bottom-0 w-full grid p-4 row-start-1 row-end-2 col-start-1 col-end-2 bg-gray-300 bg-center">
      <StandardDropdown
        trigger={
          <div
            className="[place-self:flex-start_flex-end] flex items-center bg-gray-200 gap-1 hover:bg-gray-50 py-1 px-2 rounded-full text-xs"
            onClick={onClickConfigsButton}
          >
            <BiGitBranch />
            Configs
          </div>
        }
        content={
          <Body
            configs={configs}
            defaultConfigId={defaultConfigId}
            onClick={onConfigClick}
          />
        }
        align="end"
      />
    </div>
  );
}

function Body({ configs, defaultConfigId, onClick }) {
  return configs.map((x, idx) => (
    <Item
      className="flex flex-row"
      key={`Config ${idx}`}
      onClick={(e) => onClick(e, x.id)}
    >
      {x.name}
      <DefaultConfigBadge config={x} defaultConfigId={defaultConfigId} />
    </Item>
  ));
}

function ProjectNameSetter({ onClick }) {
  const [presetName, setPresetName] = useState("");

  function onChange(e) {
    setPresetName(e.target.value);
  }
  function localOnClick() {
    onClick(presetName);
  }

  return (
    <>
      <input
        placeholder="Project Name"
        onChange={onChange}
        value={presetName}
      />
      <Button onClick={localOnClick}>Create</Button>
    </>
  );
}

export function DefaultConfigBadge({ config, defaultConfigId }) {
  return (
    config.id === defaultConfigId && (
      <Badge twClasses="bg-green-100 text-green-800">Default</Badge>
    )
  );
}

function Badges() {
  return (
    <div className="flex flex-row gap-[0.15rem] mt-1 [background:linear-gradient(to right,  rgba(255,255,255,0) 0%,rgba(255,255,255,1) 70%)] badgefade">
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
