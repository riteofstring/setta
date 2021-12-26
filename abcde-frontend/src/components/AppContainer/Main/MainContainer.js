import { Box } from "@chakra-ui/react";
import { useState } from "react";
import CustomGrid from "utils/CustomMapInteraction/CustomGrid";
import CustomMapInteractionCSS from "utils/CustomMapInteraction/CustomMapInteractionCSS";

import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const [contentSize, setContentSize] = useState({});

  return (
    <>
      <Overview />
      <UiEditor />
      <GridWrapper>
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
      </GridWrapper>
    </>
  );
}
