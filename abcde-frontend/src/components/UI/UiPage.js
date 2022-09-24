import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";
import { NO_AUTH } from "utils/constants";
import { loadTestData } from "__tests__utils/loadTestData";
import SectionsPane from "./Section/SectionsPane";

const UiPage = () => {
  const loadSections = useStoreActions((x) => x.master.loadSections);
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const isNewSession = useStoreState((x) => x.auth.isNewSession);
  const stayLoggedIn = useStoreActions((x) => x.auth.stayLoggedIn);

  useEffect(() => {
    if (NO_AUTH && isAuthenticated && isNewSession) {
      loadSections(loadTestData());
      // set isNewSession to false so that loadTestData won't be called again later
      stayLoggedIn();
    }
  }, [isAuthenticated, isNewSession]);

  return <SectionsPane />;
};

export default React.memo(UiPage);
