import * as Tooltip from "@radix-ui/react-tooltip";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { useCurrPage } from "models/currPage";
import { useProjectToLoad } from "models/info/projectToLoad";
import React, { forwardRef, useEffect, useState } from "react";
import { BiGitBranch, BiPlus } from "react-icons/bi";
import Badge from "utils/atoms/badges/badge";
import { Button } from "utils/atoms/buttons/Button";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { UI } from "utils/pageNames";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";

function HomePage() {
  const { projects, getProjects, createProject } = useGetOrCreateProjects();

  useEffect(() => {
    getProjects();
  }, []);

  return (
    <GridWrapper gridProps="bg-gray-100">
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

  return (
    <div className="overflow-y-auto px-10 py-8">
      <div className="flex gap-4">
        <PopoverWrapper
          trigger={
            <StandardButton twClasses="py-2 px-4 rounded-full font-bold font-heading text-white bg-gray-600 border border-solid border-gray-300 hover:border-white hover:shadow-xl hover:bg-white hover:text-gray-900 gap-2">
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
      <h3 className="font-bold font-heading text-gray-600 overflow-hidden overflow-ellipsis whitespace-nowrap">
        {name + name + name}
      </h3>
      <div className="grid grid-cols-[repeat(minmax(0, 1fr))] md:grid-cols-[repeat(auto-fit,_minmax(15rem,_1fr))] xl:grid-cols-[repeat(auto-fill,_minmax(20rem,_1fr))] gap-8 pt-7 justify-items-start">
        {Object.values(projects).map((x, i) => (
          <ToolTipWrapper project={x} key={`Project ${i} ${x.name}`}>
            <ProjectItem project={x} />
          </ToolTipWrapper>
        ))}
      </div>
    </div>
  );
}
const ProjectItem = forwardRef((props, forwardedRef) => {
  const { name, id, configs, defaultConfigId } = props.project;
  const setCurrPage = useCurrPage((x) => x.setName);
  const setProjectToLoad = useProjectToLoad((x) => x.setProject);
  const [openConfigs, setOpenConfigs] = useState(false);

  function onClick() {
    setCurrPage(UI);
    setProjectToLoad({ id, configId: defaultConfigId });
  }

  function onClickConfigsButton(e) {
    e.stopPropagation();
    setOpenConfigs(!openConfigs);
  }

  function onConfigClick(e, configId) {
    e.stopPropagation();
    setCurrPage(UI);
    setProjectToLoad({ id, configId });
  }

  // bg-[url('https://via.placeholder.com/400')]

  return (
    <div onClick={onClick} ref={forwardedRef}>
      <div className="absolute top-0 left-0 bottom-0 w-full grid p-4 row-start-1 row-end-2 col-start-1 col-end-2 bg-gray-300 bg-center">
        <div className="[place-self:flex-start_flex-end]">
          <PopoverWrapper
            trigger={
              <div
                className="flex items-center bg-gray-200 gap-1 hover:bg-gray-50 py-1 px-2 rounded-full text-xs"
                onClick={onClickConfigsButton}
              >
                <BiGitBranch />
                Configs
              </div>
            }
            body={
              <Body
                configs={configs}
                defaultConfigId={defaultConfigId}
                onClick={onConfigClick}
              />
            }
            header="Configs"
            open={openConfigs}
            onOpenChange={setOpenConfigs}
          />
        </div>
      </div>
      <div className="absolute bottom-0 top-0 left-0 w-full p-4 row-start-2 row-end-3 col-start-1 col-end-2 bg-white ">
        <h3 className="font-bold font-heading text-gray-600 overflow-hidden overflow-ellipsis whitespace-nowrap">
          {name}
        </h3>
        <div className="flex flex-row gap-[0.15rem] mt-1 [background:linear-gradient(to right,  rgba(255,255,255,0) 0%,rgba(255,255,255,1) 70%)]">
          <Badge twClasses="bg-green-100 text-green-800">PyTorch 2.9</Badge>
          <Badge twClasses="bg-red-100 text-red-800">NumPy</Badge>
          <Badge twClasses="bg-green-100 text-green-800">PyTorch 2.9</Badge>
          <Badge twClasses="bg-red-100 text-red-800">NumPy</Badge>
          <Badge twClasses="bg-green-100 text-green-800">PyTorch 2.9</Badge>
          <Badge twClasses="bg-red-100 text-red-800">NumPy</Badge>
          <Badge twClasses="bg-green-100 text-green-800">PyTorch 2.9</Badge>
          <Badge twClasses="bg-red-100 text-red-800">NumPy</Badge>
          <Badge twClasses="bg-green-100 text-green-800">PyTorch 2.9</Badge>
          <Badge twClasses="bg-red-100 text-red-800">NumPy</Badge>
        </div>
      </div>
    </div>
  );
});

function ToolTipWrapper({ project, children }) {
  const { name } = project;
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger className="relative grid grid-rows-[1fr_5rem] rounded-3xl border border-solid border-transparent min-h-[15rem] w-full overflow-hidden hover:transition-all hover:shadow-xl hover:cursor-pointer hover:border-white gap-0">
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="bg-white rounded-md shadow-md py-2 px-3 text-sm text-gray-700">
            <Tooltip.Arrow className="[fill:white]" />
            <h4 className="font-bold font-heading">
              {name + name + " " + name + name}
            </h4>
            <h5 className="mt-2">Libraries</h5>
            <ul className="list-none flex flex-col ml-2">
              <li>Numpy</li>
              <li>PyTorch 2.9</li>
              <li>Pandas</li>
              <li>SciKit-Learn</li>
              <li>SciPy</li>
            </ul>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function Body({ configs, defaultConfigId, onClick }) {
  return configs.map((x, idx) => (
    <div
      className="flex flex-row"
      key={`Config ${idx}`}
      onClick={(e) => onClick(e, x.id)}
    >
      <p>{x.name}</p>
      <DefaultConfigBadge config={x} defaultConfigId={defaultConfigId} />
    </div>
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
      <Badge tailwindClasses="bg-green-100 text-green-800">Default</Badge>
    )
  );
}
