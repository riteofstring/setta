import { Grid, SimpleGrid, GridItem } from "@chakra-ui/react";
import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import React from "react";
import { Link } from "react-router-dom";

function HomePage() {
  return (
    <GridWrapper gridTemplateColumns="300px 1fr" display="grid">
      <LeftColumn />
      <RightColumn />
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

function RightColumn() {
  return (
    <GridItem overflowY="auto">
      <SimpleGrid
        // columns={[1, null, null, 2, 3, "auto"]}
        // minChildWidth="10rem"
        spacing={10}
        p="2.5rem"
        minChildWidth="20rem"
      >
        <DummyItem />
        <DummyItem />
        <DummyItem />
        <DummyItem />
        <DummyItem />
        <DummyItem />
        <DummyItem />
        <DummyItem />
      </SimpleGrid>
    </GridItem>
  );
}

function DummyItem() {
  return (
    <Link to="/">
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
      >
        <GridItem p="1rem" bg="gray.50"></GridItem>
        <GridItem p="1rem">Description</GridItem>
      </Grid>
    </Link>
  );
}
