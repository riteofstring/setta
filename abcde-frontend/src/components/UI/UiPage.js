import { loadProject } from "dbRequests/projects";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useProjectLoader } from "hooks/useProjectLoader";
import React, { useEffect } from "react";
import { NO_AUTH } from "utils/constants";
import { getRootSectionId } from "utils/utils";
import { loadTestData } from "__tests__utils/loadTestData";
import SectionsPane from "./Section/SectionsPane";

const UiPage = () => {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const isNewSession = useStoreState((x) => x.auth.isNewSession);
  const access_token = useStoreState((x) => x.auth.access_token);
  const currProject = useStoreState((x) => x.currProject.id);
  const projectLoader = useProjectLoader();
  const noAuthLoader = useNoAuthLoading();
  const authLoader = useAuthLoading();

  useEffect(() => {
    async function fn() {
      if (isAuthenticated && isNewSession) {
        if (NO_AUTH) {
          noAuthLoader(projectLoader);
        } else {
          const projectInfo = await fetchData(access_token, currProject);
          authLoader(projectLoader, projectInfo);
        }
      }
    }
    fn();
  }, [isAuthenticated, isNewSession]);

  return <SectionsPane />;
};

export default React.memo(UiPage);

async function fetchData(access_token, id) {
  return await loadProject({ access_token, id });
}

function useNoAuthLoading() {
  const stayLoggedIn = useStoreActions((x) => x.auth.stayLoggedIn);
  const setSectionGroup = useStoreActions((x) => x.currProject.setSectionGroup);

  return (projectLoader) => {
    const testData = loadTestData();
    const rootSection = getRootSectionId(testData.sectionChildren);
    setSectionGroup(rootSection);
    projectLoader(testData);
    // set isNewSession to false so that loadTestData won't be called again later
    stayLoggedIn();
  };
}

function useAuthLoading() {
  const stayLoggedIn = useStoreActions((x) => x.auth.stayLoggedIn);
  const setSectionGroup = useStoreActions((x) => x.currProject.setSectionGroup);

  return (projectLoader, projectInfo) => {
    // TODO remove this
    const { projectDefaults, globalDefaults, sectionConfigs } = loadTestData();
    const rootSection = getRootSectionId(projectInfo.sectionChildren);
    let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
    uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
    setSectionGroup(rootSection);
    projectLoader({
      projectDefaults,
      globalDefaults,
      sectionConfigs,
      uiTypes,
      ...theRest,
    });
    // set isNewSession to false so that loadTestData won't be called again later
    stayLoggedIn();
  };
}
