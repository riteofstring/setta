import { Box } from "@chakra-ui/react";
import { loadProject } from "dbRequests/projects";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useProjectLoader } from "hooks/useProjectLoader";
import { useEffect, useState } from "react";
import { ReactFlowProvider } from "react-flow-renderer";
import { NO_AUTH } from "utils/constants";
import { getRootSectionId } from "utils/utils";
import { loadTestData } from "__tests__utils/loadTestData";
import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const projectId = useStoreState((x) => x.project.id);
  const projectLoader = useProjectLoader();
  const noAuthLoader = useNoAuthLoading();
  const authLoader = useAuthLoading();
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function fn() {
      if (NO_AUTH && !projectId) {
        setDoneLoading(false);
        setDoneLoading(noAuthLoader(projectLoader));
      } else if (!NO_AUTH && isAuthenticated && projectId) {
        setDoneLoading(false);
        setDoneLoading(await authLoader(projectLoader, projectId));
      } else {
        setDoneLoading(true);
      }
    }
    fn();
  }, [projectId]);

  return (
    doneLoading && (
      <ReactFlowProvider>
        <Overview />
        <UiEditor />
        <GridWrapper>
          <Box h="inherit" overflow="hidden" flex="1" minH="0" minW="0">
            {/* <Box padding="2.5rem" h="100%"> */}
            <UIPage />
            {/* </Box> */}
          </Box>
        </GridWrapper>
      </ReactFlowProvider>
    )
  );
}

async function fetchData(access_token, id) {
  return await loadProject({ access_token, id });
}

function useNoAuthLoading() {
  const setRootSection = useStoreActions((x) => x.project.setRootSection);

  return (projectLoader) => {
    const testData = loadTestData();
    const rootSection = getRootSectionId(testData.sectionChildren);
    setRootSection(rootSection);
    projectLoader(testData);
    return true;
  };
}

function useAuthLoading() {
  const setRootSection = useStoreActions((x) => x.project.setRootSection);
  const clearSections = useStoreActions((x) => x.master.clearSections);
  const access_token = useStoreState((x) => x.auth.access_token);

  return async (projectLoader, projectId) => {
    // TODO remove this
    const projectInfo = await fetchData(access_token, projectId);
    const { projectDefaults, globalDefaults } = loadTestData();
    clearSections();
    const rootSection = getRootSectionId(projectInfo.sectionChildren);
    let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
    uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
    setRootSection(rootSection);
    projectLoader({
      projectDefaults,
      globalDefaults,
      uiTypes,
      ...theRest,
    });
    return true;
  };
}
