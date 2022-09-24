import { loadProject } from "dbRequests/projects";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useProjectLoader } from "hooks/useProjectLoader";
import React, { useEffect } from "react";
import { NO_AUTH } from "utils/constants";
import { loadTestData } from "__tests__utils/loadTestData";
import SectionsPane from "./Section/SectionsPane";

const UiPage = () => {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const isNewSession = useStoreState((x) => x.auth.isNewSession);
  const stayLoggedIn = useStoreActions((x) => x.auth.stayLoggedIn);
  const access_token = useStoreState((x) => x.auth.access_token);
  const currProject = useStoreState((x) => x.currProject.id);
  const projectLoader = useProjectLoader();

  useEffect(() => {
    async function fetchData() {
      return await loadProject({ access_token, id: currProject });
    }

    if (NO_AUTH && isAuthenticated && isNewSession) {
      projectLoader(loadTestData());
      // set isNewSession to false so that loadTestData won't be called again later
      stayLoggedIn();
    } else {
      const projectInfo = fetchData();
      console.log("projectInfo", projectInfo);
    }
  }, [isAuthenticated, isNewSession]);

  return <SectionsPane />;
};

export default React.memo(UiPage);
