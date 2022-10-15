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
  const access_token = useStoreState((x) => x.auth.access_token);
  const currProject = useStoreState((x) => x.currProject.id);
  const projectLoader = useProjectLoader();
  const noAuthLoader = useNoAuthLoading();
  const authLoader = useAuthLoading();
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function fn() {
      if (NO_AUTH && !currProject) {
        setDoneLoading(false);
        setDoneLoading(noAuthLoader(projectLoader));
      } else if (!NO_AUTH && isAuthenticated && currProject) {
        setDoneLoading(false);
        const projectInfo = await fetchData(access_token, currProject);
        setDoneLoading(authLoader(projectLoader, projectInfo));
      } else {
        setDoneLoading(true);
      }
    }
    fn();
  }, [currProject]);

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
  const setCurrProject = useStoreActions((x) => x.currProject.setId);
  const setSectionGroup = useStoreActions((x) => x.currProject.setSectionGroup);

  return (projectLoader) => {
    const projectId = "61e089c8-62bf-4e8c-915e-111b4587da81";
    setCurrProject(projectId);
    const testData = loadTestData(projectId);

    const rootSection = getRootSectionId(testData.sectionChildren);
    setSectionGroup(rootSection);
    projectLoader(testData);
    return true;
  };
}

function useAuthLoading() {
  const setSectionGroup = useStoreActions((x) => x.currProject.setSectionGroup);
  const clearSections = useStoreActions((x) => x.master.clearSections);

  return (projectLoader, projectInfo) => {
    // TODO remove this
    const { projectDefaults, globalDefaults } = loadTestData();
    clearSections();
    const rootSection = getRootSectionId(projectInfo.sectionChildren);
    let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
    uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
    setSectionGroup(rootSection);
    projectLoader({
      projectDefaults,
      globalDefaults,
      uiTypes,
      ...theRest,
    });
    return true;
  };
}
