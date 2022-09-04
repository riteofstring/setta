import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";
import { NO_AUTH } from "utils/constants";
import { loadTestData } from "__tests__utils/loadTestData";
import SectionsPane from "./Section/SectionsPane";

const UiPage = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  const isNewSession = useStoreState((state) => state.auth.isNewSession);

  useEffect(() => {
    if (NO_AUTH && isAuthenticated && isNewSession) {
      loadSections(loadTestData());
    }
  }, [isAuthenticated, isNewSession]);

  return (
    <>
      <SectionsPane />
    </>
  );
};

export default React.memo(UiPage);
