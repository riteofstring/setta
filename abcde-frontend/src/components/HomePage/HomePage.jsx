import {
  Badge,
  Box,
  Button,
  Grid,
  GridItem,
  Heading,
  HStack,
  List,
  ListItem,
  useDisclosure,
} from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useStoreActions } from "easy-peasy";
import { useCreateProject, useGetProjects } from "hooks/dbRequests/projects";
import React, { useEffect, useState } from "react";
import { BiAddToQueue, BiGitBranch } from "react-icons/bi";
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
    <GridWrapper
      gridTemplateColumns="1fr"
      display="grid"
      backgroundColor="gray.100"
    >
      {/* <LeftColumn /> */}
      <RightColumn projects={projects} setProjects={setProjects} />
    </GridWrapper>
  );
}

export default React.memo(HomePage);

function LeftColumn() {
  return (
    <GridItem
      p="2.5rem"
      borderRightStyle="solid"
      borderRightColor="gray.100"
      borderRightWidth="1px"
      overflowY="auto"
    >
      LEFT COLUMN
    </GridItem>
  );
}

function RightColumn({ projects, setProjects }) {
  const createProject = useCreateProject();

  async function onClick() {
    const newProject = await createProject({ name: "amazing project" });
    setProjects((x) => ({ ...x, [newProject.id]: newProject }));
  }

  return (
    <GridItem overflowY="auto">
      <Button
        mt="2.5rem"
        mx="2.5rem"
        borderRadius="full"
        leftIcon={<BiAddToQueue />}
        colorScheme="blue"
        onClick={onClick}
      >
        Create New Project
      </Button>

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
        <Button
          placeSelf="flex-start flex-end"
          borderRadius="full"
          leftIcon={<BiGitBranch />}
          size="xs"
          onClick={onClickConfigsButton}
        >
          Configs
        </Button>
        <ConfigButton onClose={onClose} isOpen={isOpen} configs={configs} />
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
