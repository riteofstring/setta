import { Box } from "@chakra-ui/react";
import { loadProject } from "dbRequests/projects";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useEffect, useState } from "react";
import { NO_AUTH } from "utils/constants";
import {
  loadOneProject,
  loadOneProjectById,
} from "__tests__utils/loadTestData";
import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const { idToLoad, configIdToLoad } = useProjectToLoad();
  const noAuthLoader = useNoAuthLoading();
  const authLoader = useAuthLoading();
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function fn() {
      if (NO_AUTH) {
        setDoneLoading(false);
        setDoneLoading(await noAuthLoader(idToLoad, configIdToLoad));
      } else if (!NO_AUTH && isAuthenticated && idToLoad) {
        setDoneLoading(false);
        setDoneLoading(await authLoader(idToLoad, configIdToLoad));
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

function useProjectToLoad() {
  const idToLoad = useStoreState((x) => x.projectToLoad.id);
  const configIdToLoad = useStoreState((x) => x.projectToLoad.configId);
  return { idToLoad, configIdToLoad };
}

async function fetchData(access_token, id, configId) {
  return await loadProject({ access_token, id, configId });
}

function useNoAuthLoading() {
  const loadSections = useStoreActions((x) => x.master.loadSections);
  const clearSections = useStoreActions((x) => x.master.clearSections);
  return async (projectId, projectConfigId) => {
    let testData = null;
    if (!projectId) {
      testData = await loadOneProject({});
    } else {
      testData = await loadOneProjectById({ projectId, projectConfigId });
    }
    clearSections();
    loadSections(testData);
    return true;
  };
}

function useAuthLoading() {
  const loadSections = useStoreActions((x) => x.master.loadSections);
  const clearSections = useStoreActions((x) => x.master.clearSections);
  const access_token = useStoreState((x) => x.auth.access_token);

  return async (projectId, projectConfigId) => {
    const projectInfo = await fetchData(
      access_token,
      projectId,
      projectConfigId
    );
    // TODO remove this
    const { projectDefaults, globalDefaults } = await loadOneProject({});
    clearSections();
    let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
    uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
    loadSections({
      projectDefaults,
      globalDefaults,
      uiTypes,
      ...theRest,
    });
    return true;
  };
}
