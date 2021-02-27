import { useState } from "react";
import {
  Grid,
  GridItem,
  Box,
} from "@chakra-ui/react";
import Overview, {paneProps as overviewPaneProps} from "./SidePanes/Overview/Overview";
import SubNav from "./SubNav/SubNav";
import graphPaperBg from "../../../assets/images/graph-paper.svg";
import UIPage from "../../UI/UiPage";
import UiEditor, {paneProps as uiEditorPaneProps} from "./SidePanes/UiEditor/UiEditor";
import CustomGrid from "./CustomMapInteraction/CustomGrid";
import CustomMapInteractionCSS from "./CustomMapInteraction/CustomMapInteractionCSS";
import "./PaneStyle.css";

export default function MainContainer() {
  const [contentSize, setContentSize] = useState(0);
  const [overviewWidth, setOverviewWidth] = useState(overviewPaneProps.openOnLoad ? overviewPaneProps.defaultWidth : 0);
  const [uiEditorWidth, setUIEditorWidth] = useState(uiEditorPaneProps.openOnLoad ? uiEditorPaneProps.defaultWidth : 0);

  console.log("overviewWidth", overviewWidth)
  console.log("uiEditorWidth", uiEditorWidth)

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

      <Overview onWidthChange={setOverviewWidth}/>

      <UiEditor onWidthChange={setUIEditorWidth}/>

      <GridItem
        colStart="1"
        colEnd="2"
        rowStart="2"
        rowEnd="3"
        minH="0"
        minW="0"
        h="100%"
      >
        <Box
          backgroundImage={`url(${graphPaperBg})`}
          h="inherit"
          overflow="auto"
          flex="1"
          minH="0"
          minW="0"
          id="graphpaper"
        >
          <CustomMapInteractionCSS
            // showControls={true}
            maxScale={2}
            minScale={0.33}
            scaleBase={1.5}
            marginRatios={{ x: 1, y: 0.75 }}
            contentSize={contentSize}
            initialLeftEdge={overviewPaneProps.defaultWidth}
            leftEdge={overviewWidth}
            rightEdge={uiEditorWidth}
          >
            <Box padding="2.5rem" h="100%">
              <CustomGrid gap={2} onSize={setContentSize}>
                <UIPage />
              </CustomGrid>
            </Box>
          </CustomMapInteractionCSS>
        </Box>
      </GridItem>
    </Grid>
  );
}
