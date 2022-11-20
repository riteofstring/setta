import { Box } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import { useLoadProject } from "hooks/dbRequests/projects";
import { useProjectToLoad } from "hooks/useProject";
import { useEffect, useState } from "react";
import { NO_AUTH } from "utils/constants";
import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const { idToLoad, configIdToLoad } = useProjectToLoad();
  const loadProject = useLoadProject();
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function fn() {
      if (NO_AUTH || (isAuthenticated && idToLoad)) {
        setDoneLoading(false);
        setDoneLoading(await loadProject(idToLoad, configIdToLoad));
      }
    }
    fn();
  }, [idToLoad, configIdToLoad]);

  return (
    doneLoading && (
      <>
        <Overview />
        <UiEditor />
        <GridWrapper>
          <Box h="inherit" overflow="hidden" flex="1" minH="0" minW="0">
            {/* <Box padding="2.5rem" h="100%"> */}
            <UIPage />
            {/* </Box> */}
          </Box>
        </GridWrapper>
      </>
    )
  );
}
