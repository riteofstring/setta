import { HStack, Input, List, ListItem } from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { useCurrPage } from "models/currPage";
import { useProjectToLoad } from "models/info/projectToLoad";
import React, { useEffect, useState } from "react";
import { BiAddToQueue, BiGitBranch } from "react-icons/bi";
import Badge from "utils/atoms/badges/badge";
import Button from "utils/atoms/buttons/Button";
import { UI } from "utils/pageNames";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";

function HomePage() {
  const { projects, getProjects, createProject } = useGetOrCreateProjects();

  useEffect(() => {
    getProjects();
  }, []);

  return (
    <GridWrapper gridProps=" bg-gray-100">
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
    <div className="overflow-y-auto">
      <PopoverWrapper
        trigger={
          <Button tailwindClasses="py-2 px-4 mt-10 mx-10 rounded-full font-bold text-green-900 bg-green-300 hover:bg-green-400 gap-2">
            <BiAddToQueue />
            Create New Project
          </Button>
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

  function onClick() {
    setCurrPage(UI);
    setProjectToLoad({ id, configId: defaultConfigId });
  }

  function onClickConfigsButton(e) {
    e.stopPropagation();
  }

  function onConfigClick(e, configId) {
    e.stopPropagation();
    setCurrPage(UI);
    setProjectToLoad({ id, configId });
  }

  return (
    <div
      className="grid grid-rows-[1fr_5rem] rounded-3xl border border-gray-300 min-h-[15rem] sm:w-80 overflow-hidden hover:transition-all hover:shadow-lg hover:border-white hover:cursor-pointer"
      onClick={onClick}
    >
      <div className="grid p-4 bg-gray-300 bg-[url('https://via.placeholder.com/400')] bg-center">
        <PopoverWrapper
          trigger={
            <Button
              tailwindClasses="bg-gray-200 hover:bg-gray-50 py-1 px-2 rounded-full text-xs [place-self:flex-start_flex-end]"
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
        />
      </div>
      <div className="p-4 bg-white">
        <h3 className="text-base">{name}</h3>
        <div className="flex flex-row gap-[0.15rem] mt-1">
          <Badge tailwindClasses="bg-green-100 text-green-800">
            PyTorch 2.9
          </Badge>
          <Badge tailwindClasses="bg-red-100 text-red-800">NumPy</Badge>
        </div>
      </div>
    </div>
  );
}

function Body({ configs, defaultConfigId, onClick }) {
  return (
    <List>
      {configs.map((x, idx) => (
        <HStack key={`Config ${idx}`} onClick={(e) => onClick(e, x.id)}>
          <ListItem>{x.name}</ListItem>
          <DefaultConfigBadge config={x} defaultConfigId={defaultConfigId} />
        </HStack>
      ))}
    </List>
  );
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
      <Input
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
