import {
  Badge,
  Button,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  List,
  ListItem,
} from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useStoreActions } from "easy-peasy";
import { useCreateProject, useGetProjects } from "hooks/dbRequests/projects";
import React, { useEffect, useRef, useState } from "react";
import { BiAddToQueue, BiGitBranch } from "react-icons/bi";
import { UI } from "utils/pageNames";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";

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
    <GridWrapper
      gridTemplateColumns="1fr"
      display="grid"
      backgroundColor="gray.100"
    >
      <RightColumn projects={projects} setProjects={setProjects} />
    </GridWrapper>
  );
}

export default React.memo(HomePage);

function RightColumn({ projects, setProjects }) {
  const createProject = useCreateProject();

  async function onClick(name) {
    const newProject = await createProject({ name });
    setProjects((x) => ({ ...x, [newProject.id]: newProject }));
  }

  return (
    <GridItem overflowY="auto">
      <PopoverWrapper
        trigger={
          <Button
            mt="2.5rem"
            mx="2.5rem"
            borderRadius="full"
            leftIcon={<BiAddToQueue />}
            colorScheme="blue"
          >
            Create New Project
          </Button>
        }
        body={<ProjectNameSetter onClick={onClick} />}
      />
      <Grid
        gridTemplateColumns="repeat(auto-fit, 20rem)"
        gap="2rem"
        pt="1.75rem"
        px="2.5rem"
        minChildWidth="20rem"
        justifyItems="flex-start"
      >
        {Object.values(projects).map((x, i) => (
          <ProjectItem key={`Project ${i} ${x.name}`} project={x} />
        ))}
      </Grid>
    </GridItem>
  );
}

function ProjectItem({ project }) {
  const { name, id, configs, defaultConfig } = project;
  const setCurrPage = useStoreActions((x) => x.currPage.setName);
  const setCurrProject = useStoreActions((x) => x.project.setId);

  function onClick() {
    setCurrPage(UI);
    setCurrProject(id);
  }

  function onClickConfigsButton(e) {
    e.stopPropagation();
  }

  return (
    <Grid
      templateRows="1fr 5rem"
      borderRadius="3xl"
      border="1px"
      borderColor="gray.300"
      minHeight="15rem"
      width={{ base: "auto", sm: "20rem" }}
      overflow="hidden"
      _hover={{
        transition: "box-shadow 200ms",
        boxShadow: "lg",
        borderColor: "white",
        cursor: "pointer",
      }}
      onClick={onClick}
    >
      <GridItem
        p="1rem"
        bg="gray.300"
        display="grid"
        backgroundImage="https://via.placeholder.com/400"
        backgroundPosition="center"
      >
        <PopoverWrapper
          trigger={
            <Button
              placeSelf="flex-start flex-end"
              borderRadius="full"
              leftIcon={<BiGitBranch />}
              size="xs"
              onClick={onClickConfigsButton}
            >
              Configs
            </Button>
          }
          body={<Body configs={configs} defaultConfig={defaultConfig} />}
          header="Configs"
        />
      </GridItem>
      <GridItem p="1rem" bg="white">
        <Heading as="h3" fontSize="md">
          {name}
        </Heading>
        <HStack gap="0.15rem" mt="0.25rem">
          <Badge colorScheme="green">PyTorch 2.9</Badge>
          <Badge colorScheme="red">NumPy</Badge>
        </HStack>
      </GridItem>
    </Grid>
  );
}

function Body({ configs, defaultConfig }) {
  return (
    <List>
      {configs.map((x, idx) => (
        <HStack key={`Config ${idx}`}>
          <ListItem>{x.name}</ListItem>
          {x.id === defaultConfig && <Badge colorScheme="green">Default</Badge>}
        </HStack>
      ))}
    </List>
  );
}

function ProjectNameSetter({ onClick }) {
  const presetNameRef = useRef();

  function localOnClick() {
    onClick(presetNameRef.current.value);
  }

  return (
    <>
      <Input placeholder="Project Name" ref={presetNameRef} />
      <Button onClick={localOnClick}>Create</Button>
    </>
  );
}
