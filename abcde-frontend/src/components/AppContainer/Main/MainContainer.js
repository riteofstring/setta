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
import { SplitPane } from "react-collapse-pane";
import "./PaneStyle.css";

export default function MainContainer() {
  return (
    <Grid
      width="90vw"
      border="1px"
      borderColor="gray.200"
      borderTopLeftRadius="1rem"
      borderTopRightRadius="1rem"
      overflow="hidden"
      templateRows="min-content 1fr"
      templateColumns="1fr"
    >
      <SubNav />

      <GridItem
        colStart="1"
        colEnd="2"
        rowStart="2"
        rowEnd="3"
        minH="0"
        minW="0"
      >
        <Flex>
          <SplitPane
            resizerOptions={{
              css: {
                width: "1px",
                background: "rgba(0, 0, 0, 0.1)",
              },
              hoverCss: {
                width: "3px",
                background: "1px solid rgba(102, 194, 255, 0.5)",
              },
              grabberSize: "1rem",
            }}
            collapseOptions={{
              beforeToggleButton: (
                <IconButton
                  icon={<HiChevronRight />}
                  color="gray.500"
                  bg="whiteAlpha"
                  size="sm"
                  ml="0.25rem"
                  mr="0.5rem"
                  alignSelf="center"
                />
              ),
              afterToggleButton: (
                <IconButton
                  icon={<HiChevronLeft />}
                  color="gray.500"
                  bg="whiteAlpha"
                  size="sm"
                  ml="0.25rem"
                  mr="0.5rem"
                  alignSelf="center"
                />
              ),
              overlayCss: { backgroundColor: "black" },
              buttonTransition: "zoom",
              buttonPositionOffset: -20,
              collapsedSize: 50,
              collapseTransitionTimeout: 350,
            }}
            split="vertical"
          >
            <Overview />

            <Box
              height="calc(100vh - 10.5rem)"
              overflow="auto"
              flex="1"
              minH="0"
              minW="0"
              id="graphpaperparent"
            >
              <Box
                backgroundImage={`url(${graphPaperBg})`}
                padding="2.5rem"
                id="graphpaper"
              >
                <UIPage />
              </Box>
            </Box>

            <UiEditor />
          </SplitPane>
        </Flex>
      </GridItem>
    </Grid>
  );
}
