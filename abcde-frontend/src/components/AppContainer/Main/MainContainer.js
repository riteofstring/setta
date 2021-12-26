import { Grid, GridItem, Box } from "@chakra-ui/react";
import { useState } from "react";
import CustomGrid from "utils/CustomMapInteraction/CustomGrid";
import CustomMapInteractionCSS from "utils/CustomMapInteraction/CustomMapInteractionCSS";

import UIPage from "../../UI/UiPage";
import SubNav from "./SubNav/SubNav";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const [contentSize, setContentSize] = useState({});

  return (
    <Grid
      h="100%"
      w="100vw"
      border="1px"
      overflow="hidden"
      templateRows="min-content 1fr"
      templateColumns="1fr"
      borderColor="gray.200"
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
        <Box h="inherit" overflow="hidden" flex="1" minH="0" minW="0">
          <CustomMapInteractionCSS
            // showControls={true}
            maxScale={2}
            minScale={0.1}
            scaleBase={1.5}
            marginRatios={{ x: 1, y: 1 }}
            contentSize={{
              height: contentSize.height,
              width: contentSize.width,
            }}
            excludedFromDraggingTagNames={["input", "textarea", "select"]}
            excludedFromDraggingClassNames={[
              "EditableTextarea",
              "chakra-stack DragHandle",
              "chakra-slider",
              "chakra-editable",
            ]}
            excludedFromScrollingClassNames={["SectionSearch"]}
          >
            <Box padding="2.5rem" h="100%">
              <CustomGrid setContentSize={setContentSize}>
                <UIPage />
              </CustomGrid>
            </Box>
          </CustomMapInteractionCSS>
        </Box>
      </GridItem>
    </Grid>
  );
}
