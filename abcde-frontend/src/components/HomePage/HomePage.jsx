import { useDisclosure } from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useStoreActions } from "easy-peasy";
import { useCreateProject, useGetProjects } from "hooks/dbRequests/projects";
import React, { useEffect, useState } from "react";
import { BiAddToQueue, BiGitBranch } from "react-icons/bi";
import Badge from "utils/atoms/badges/badge";
import Button from "utils/atoms/buttons/Button";
import ModalContainer from "utils/ModalContainer/ModalContainer";
import { UI } from "utils/pageNames";

function HomePage() {
  const getProjects = useGetProjects();
  const [projects, setProjects] = useState({});

  async function fetchData() {
    setProjects(await getProjects());
  }

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <GridWrapper gridProps=" bg-gray-100">
      <RightColumn projects={projects} setProjects={setProjects} />
    </GridWrapper>
  );
}

export default React.memo(HomePage);

function RightColumn({ projects, setProjects }) {
  const createProject = useCreateProject();

  async function onClick() {
    const newProject = await createProject({ name: "amazing project" });
    setProjects((x) => ({ ...x, [newProject.id]: newProject }));
  }

  return (
    <div className="overflow-y-auto">
      <Button
        tailwindClasses="py-2 px-4 mt-10 mx-10 rounded-full font-bold text-green-900 bg-green-300 hover:bg-green-400 gap-2"
        onClick={onClick}
      >
        <BiAddToQueue />
        Create New Project
      </Button>

      <div className="grid grid-cols-[repeat(auto-fit,_20rem)] gap-8 pt-7 px-10 justify-items-start">
        {Object.values(projects).map((x, i) => (
          <ProjectItem key={`Project ${i} ${x.name}`} project={x} />
        ))}
      </div>
    </div>
  );
}

function ProjectItem({ project }) {
  const { name, id, configs } = project;
  const setCurrPage = useStoreActions((x) => x.currPage.setName);
  const setCurrProject = useStoreActions((x) => x.project.setId);

  function onClick() {
    setCurrPage(UI);
    setCurrProject(id);
  }
  const { isOpen, onOpen, onClose } = useDisclosure();

  function onClickConfigsButton(e) {
    e.stopPropagation();
    onOpen();
  }

  return (
    <div
      className="grid grid-rows-[1fr_5rem] rounded-3xl border border-gray-300 min-h-[15rem] sm:w-80 overflow-hidden hover:transition-all hover:shadow-lg hover:border-white hover:cursor-pointer"
      onClick={onClick}
    >
      <div className="grid p-4 bg-gray-300 bg-[url('https://via.placeholder.com/400')] bg-center">
        <Button
          tailwindClasses="bg-gray-200 hover:bg-gray-50 py-1 px-2 rounded-full text-xs [place-self:flex-start_flex-end]"
          onClick={onClickConfigsButton}
        >
          <BiGitBranch />
          Configs
        </Button>
        <ConfigButton onClose={onClose} isOpen={isOpen} configs={configs} />
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

function ConfigButton({ onClose, isOpen, configs }) {
  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"4xl"}
      header={<Header />}
      overrideFooter={true}
      body={<Body configs={configs} />}
      // footer={<Footer />}
    />
  );
}

function Header() {
  return <h1>Configs</h1>;
}

function Body({ configs }) {
  return (
    <ul>
      {configs.map((x, idx) => (
        <li key={`Config ${idx}`}>{x.name}</li>
      ))}
    </ul>
  );
}

function Footer() {
  return <div />;
}
