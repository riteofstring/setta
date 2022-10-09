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

  useEffect(() => {
    if (NO_AUTH) {
      if (isAuthenticated && isNewSession) {
        noAuthLoader(projectLoader);
      }
    } else {
      const projectInfo = fetchData(access_token, currProject);
      console.log("projectInfo", projectInfo);
    }
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

  return async (projectLoader) => {
    const testData = loadTestData();
    const rootSection = getRootSectionId(testData.sectionChildren);
    setSectionGroup(rootSection);
    projectLoader(testData);
    // set isNewSession to false so that loadTestData won't be called again later
    stayLoggedIn();
  };
}
