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
  const access_token = useStoreState((x) => x.auth.access_token);
  const currProject = useStoreState((x) => x.currProject.id);
  const projectLoader = useProjectLoader();
  const noAuthLoader = useNoAuthLoading();
  const authLoader = useAuthLoading();

  useEffect(() => {
    async function fn() {
      if (NO_AUTH && !currProject) {
        noAuthLoader(projectLoader);
      } else if (!NO_AUTH && isAuthenticated && currProject) {
        const projectInfo = await fetchData(access_token, currProject);
        authLoader(projectLoader, projectInfo);
      }
    }
    fn();
  }, [currProject]);

  return <SectionsPane />;
};

export default React.memo(UiPage);

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
  };
}

function useAuthLoading() {
  const setSectionGroup = useStoreActions((x) => x.currProject.setSectionGroup);

  return (projectLoader, projectInfo) => {
    // TODO remove this
    const { projectDefaults, globalDefaults } = loadTestData();
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
  };
}
