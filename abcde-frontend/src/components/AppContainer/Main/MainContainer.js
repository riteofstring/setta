import { Box } from "@chakra-ui/react";
import { useContextMenu } from "react-contexify";
import { ReactFlowProvider } from "react-flow-renderer";
import { NewSectionMenu } from "utils/ContextMenu/NewSectionMenu";

import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const { show } = useContextMenu({ id: "NewSectionMenu" });

  function displayMenu(e) {
    show(e);
  }

  return (
    <ReactFlowProvider>
      <Overview />
      <UiEditor />
      <GridWrapper>
        <Box h="inherit" overflow="hidden" flex="1" minH="0" minW="0">
          <Box padding="2.5rem" h="100%" onContextMenu={displayMenu}>
            <UIPage />
            <NewSectionMenu />
          </Box>
        </Box>
      </GridWrapper>
    </ReactFlowProvider>
  );
}
