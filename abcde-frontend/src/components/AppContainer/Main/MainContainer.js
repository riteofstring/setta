import { useState } from "react";
import { Grid, GridItem, Flex, Box } from "@chakra-ui/react";
import Overview from "./SidePanes/Overview/Overview";
import SubNav from "./SubNav/SubNav";
import graphPaperBg from "../../../assets/images/graph-paper.svg";
// import SectionContainer from "../../UI/Section/SectionContainer";
// import NestedSection from "../../UI/Section/NestedSection/NestedSection";
import UIPage from "../../UI/UiPage";
import UiEditor from "./SidePanes/UiEditor/UiEditor";
import CustomGrid from "./CustomMapInteraction/CustomGrid";
import CustomMapInteractionCSS from "./CustomMapInteraction/CustomMapInteractionCSS";

export default function MainContainer() {
  const [contentSize, setContentSize] = useState(0);

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
          <Overview />
          <Box
            height="calc(100vh - 10.5rem)"
            overflow="auto"
            flex="1"
            minH="0"
            minW="0"
            id="graphpaperparent"
          >
            <CustomMapInteractionCSS
              // showControls={true}
              maxScale={2}
              minScale={0.33}
              scaleBase={1.5}
              marginRatios={{ x: 1, y: 0.75 }}
              contentSize={contentSize}
            >
              <Box
                backgroundImage={`url(${graphPaperBg})`}
                padding="2.5rem"
                id="graphpaper"
              >
                <CustomGrid gap={2} onSize={setContentSize}>
                  <UIPage />
                </CustomGrid>
              </Box>
            </CustomMapInteractionCSS>
          </Box>
          <UiEditor />
        </Flex>
      </GridItem>
    </Grid>
  );
}
