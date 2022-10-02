import {
  Badge,
  Button,
  Grid,
  GridItem,
  Heading,
  HStack,
} from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { getProjects } from "dbRequests/projects";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect, useState } from "react";
import { BiAddToQueue, BiGitBranch } from "react-icons/bi";
import { UI } from "utils/pageNames";

function HomePage() {
  const access_token = useStoreState((x) => x.auth.access_token);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    async function fetchData() {
      setProjects(await getProjects({ access_token }));
    }
    fetchData();
  }, []);

  return (
    <GridWrapper
      gridTemplateColumns="1fr"
      display="grid"
      backgroundColor="gray.100"
    >
      {/* <LeftColumn /> */}
      <RightColumn projects={projects} />
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

function RightColumn({ projects }) {
  return (
    <GridItem overflowY="auto">
      <Button
        mt="2.5rem"
        mx="2.5rem"
        borderRadius="full"
        leftIcon={<BiAddToQueue />}
        colorScheme="blue"
      >
        Create New Project
      </Button>
      <Grid
        // columns={[1, null, null, 2, 3, "auto"]}
        // minChildWidth="10rem"
        // gridTemplateColumns="auto-fill"
        gridTemplateColumns="repeat(auto-fit, 20rem)"
        gap="2rem"
        pt="1.75rem"
        px="2.5rem"
        minChildWidth="20rem"
        justifyItems="flex-start"
      >
        {projects.map((x) => (
          <ProjectItem key={`Project ${x.name}`} name={x.name} />
        ))}
      </Grid>
    </GridItem>
  );
}

function ProjectItem({ name }) {
  const setCurrPage = useStoreActions((x) => x.currPage.setName);

  return (
    <Grid
      templateRows="1fr 5rem"
      borderRadius="3xl"
      border="1px"
      borderColor="gray.300"
      minHeight="15rem"
      width={{ base: "auto", sm: "20rem" }}
      overflow="hidden"
      // boxShadow="sm"
      _hover={{
        transition: "box-shadow 200ms",
        boxShadow: "lg",
        borderColor: "white",
        cursor: "pointer",
      }}
      onClick={() => setCurrPage(UI)}
    >
      <GridItem p="1rem" bg="gray.300" display="grid">
        <Button
          placeSelf="flex-start flex-end"
          borderRadius="full"
          leftIcon={<BiGitBranch />}
          size="xs"
        >
          Configs
        </Button>
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
