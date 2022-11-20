import {
  Badge,
  Box,
  Heading,
  List,
  ListItem,
  useDisclosure,
} from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useStoreActions } from "easy-peasy";
import { useCreateProject, useGetProjects } from "hooks/dbRequests/projects";
import React, { useEffect, useState } from "react";
import { BiAddToQueue, BiGitBranch } from "react-icons/bi";
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
        tailwindClasses="mt-10 mx-10 rounded-full bg-blue-500"
        onClick={onClick}
      >
        <BiAddToQueue />
        Create New Project
      </Button>

      <div
        className="grid grid-cols-[repeat(auto-fit,_20rem)] auto-rows-auto grid-flow-col gap-8 pt-7 px-10 justify-items-start"

        // minChildWidth="20rem"
      >
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
          tailwindClasses="round-full text-xs [place-self:flex-start_flex-end]"
          onClick={onClickConfigsButton}
        >
          <BiGitBranch />
          Configs
        </Button>
        <ConfigButton onClose={onClose} isOpen={isOpen} configs={configs} />
      </div>
      <div className="p-4 bg-white">
        <Heading as="h3" fontSize="md">
          {name}
        </Heading>
        <div className="flex flex-row gap-[0.15rem] mt-1">
          <Badge colorScheme="green">PyTorch 2.9</Badge>
          <Badge colorScheme="red">NumPy</Badge>
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
  return <Heading>Configs</Heading>;
}

function Body({ configs }) {
  return (
    <List>
      {configs.map((x, idx) => (
        <ListItem key={`Config ${idx}`}>{x.name}</ListItem>
      ))}
    </List>
  );
}

function Footer() {
  return <Box />;
}
