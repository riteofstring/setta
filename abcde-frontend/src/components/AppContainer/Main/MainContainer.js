import { Grid, GridItem, Flex } from "@chakra-ui/react";
import Overview from "../../UI/Overview/Overview";
import SubNav from "./SubNav/SubNav";
import graphPaperBg from "../../../assets/images/graph-paper.svg";
// import SectionContainer from "../../UI/Section/SectionContainer";
// import NestedSection from "../../UI/Section/NestedSection/NestedSection";
import UIPage from "../../UI/UiPage";
import UiEditor from "./UiEditor/UiEditor";

export default function MainContainer() {
  return (
    <Grid
      width="90vw"
      height="calc(100% - 6rem)"
      border="1px"
      borderColor="gray.200"
      borderTopLeftRadius="1rem"
      borderTopRightRadius="1rem"
      overflow="hidden"
      templateRows="min-content 1fr"
      templateColumns="min-content 1fr min-content"
    >
      <SubNav />

      <Overview />

      <GridItem
        colStart="2"
        colEnd="3"
        rowStart="2"
        rowEnd="3"
        w="100%"
        h="100%"
        backgroundImage={`url(${graphPaperBg})`}
        overflow="auto"
      >
        <Flex justify="flex-start" ml="2rem" mt="1rem">
          <Grid width="700px" overflow="visible" my="1rem" gap={2}>
            <UIPage />
          </Grid>
        </Flex>
      </GridItem>
      <UiEditor />
    </Grid>
  );
}
