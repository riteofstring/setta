import { Box } from "@chakra-ui/react";
import { ReactFlowProvider } from "react-flow-renderer";

import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  return (
    <ReactFlowProvider>
      <Overview />
      <UiEditor />
      <GridWrapper>
        <Box h="inherit" overflow="hidden" flex="1" minH="0" minW="0">
          <Box padding="2.5rem" h="100%">
            <UIPage />
          </Box>
        </Box>
      </GridWrapper>
    </ReactFlowProvider>
  );
}
