import { Grid, GridItem, SimpleGrid } from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { getProjects } from "dbRequests/projects";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect, useState } from "react";
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
    <GridWrapper gridTemplateColumns="300px 1fr" display="grid">
      <LeftColumn />
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
      <SimpleGrid
        // columns={[1, null, null, 2, 3, "auto"]}
        // minChildWidth="10rem"
        spacing={10}
        p="2.5rem"
        minChildWidth="20rem"
      >
        {projects.map((x) => (
          <ProjectItem key={`Project ${x.name}`} name={x.name} id={x.id} />
        ))}
      </SimpleGrid>
    </GridItem>
  );
}

function ProjectItem({ name, id }) {
  const setCurrPage = useStoreActions((x) => x.currPage.setName);
  const setCurrProject = useStoreActions((x) => x.currProject.setId);

  function onClick() {
    setCurrPage(UI);
    setCurrProject(id);
  }

  return (
    <Grid
      templateRows="1fr 5rem"
      borderRadius="3xl"
      border="1px"
      borderColor="gray.100"
      minHeight="15rem"
      overflow="hidden"
      // boxShadow="sm"
      _hover={{
        transition: "box-shadow 200ms",
        boxShadow: "lg",
        borderColor: "white",
        cursor: "pointer",
      }}
      onClick={onClick}
    >
      <GridItem p="1rem" bg="gray.50"></GridItem>
      <GridItem p="1rem">{name}</GridItem>
    </Grid>
  );
}
