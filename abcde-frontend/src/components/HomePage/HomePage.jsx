import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { useCurrPage } from "models/currPage";
import { useProjectToLoad } from "models/info/projectToLoad";
import React, { useEffect, useState } from "react";
import { BiGitBranch, BiPlus } from "react-icons/bi";
import Badge from "utils/atoms/badges/badge";
import { Button } from "utils/atoms/buttons/Button";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
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

  return (
    <div className="overflow-y-auto py-8">
      <PopoverWrapper
        trigger={
          <StandardButton twClasses="py-2 px-4 mx-10 rounded-full font-bold font-heading text-white bg-gray-600 border border-solid border-gray-300 hover:border-white hover:shadow-xl hover:bg-white hover:text-gray-900 gap-2">
            <BiPlus />
            Create New Project
          </StandardButton>
        }
        body={<ProjectNameSetter onClick={onClick} />}
      />

      <div className="grid grid-cols-[repeat(auto-fit,_20rem)] gap-8 pt-7 px-10 justify-items-start">
        {Object.values(projects).map((x, i) => (
          <ProjectItem key={`Project ${i} ${x.name}`} project={x} />
        ))}
      </div>
    </div>
  );
}

function ProjectItem({ project }) {
  const { name, id, configs, defaultConfigId } = project;
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
    <div
      className="grid grid-rows-[1fr_5rem] rounded-3xl border border-solid min-h-[15rem] sm:w-80 overflow-hidden hover:transition-all hover:shadow-xl  hover:cursor-pointer hover:border-white"
      onClick={onClick}
    >
      <div className="grid p-4 bg-gray-300  bg-center">
        <div className="[place-self:flex-start_flex-end]">
          <PopoverWrapper
            trigger={
              <Button
                twClasses="bg-gray-200 hover:bg-gray-50 py-1 px-2 rounded-full text-xs"
                onClick={onClickConfigsButton}
              >
                <BiGitBranch />
                Configs
              </Button>
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
      <div className="p-4 bg-white">
        <h3 className="font-bold font-heading text-gray-600">{name}</h3>
        <div className="flex flex-row gap-[0.15rem] mt-1">
          <Badge twClasses="bg-green-100 text-green-800 ">PyTorch 2.9</Badge>
          <Badge twClasses="bg-red-100 text-red-800">NumPy</Badge>
        </div>
      </div>
    </div>
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
