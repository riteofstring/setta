import {
  Grid,
  GridItem,
  Flex,
  IconButton,
  Box,
  forwardRef,
} from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import Overview from "./SidePanes/Overview/Overview";
import SubNav from "./SubNav/SubNav";
import graphPaperBg from "../../../assets/images/graph-paper.svg";
// import SectionContainer from "../../UI/Section/SectionContainer";
// import NestedSection from "../../UI/Section/NestedSection/NestedSection";
import UIPage from "../../UI/UiPage";
import UiEditor from "./SidePanes/UiEditor/UiEditor";
// import { SplitPane } from "react-collapse-pane";
import "./PaneStyle.css";

export default function MainContainer() {
  return (
    <Grid
      h="100%"
      w="100vw"
      border="1px"
      borderColor="gray.200"
      overflow="hidden"
      templateRows="min-content 1fr"
      templateColumns="1fr"
    >
      <SubNav />

      <Overview />

      <UiEditor />

      <GridItem
        colStart="1"
        colEnd="2"
        rowStart="2"
        rowEnd="3"
        minH="0"
        minW="0"
        h="100%"
      >
        <Box h="inherit" overflow="auto" flex="1" minH="0" minW="0">
          <Box
            backgroundImage={`url(${graphPaperBg})`}
            padding="2.5rem"
            h="100%"
          >
            <UIPage />
          </Box>
        </Box>
      </GridItem>
    </Grid>
  );
}
