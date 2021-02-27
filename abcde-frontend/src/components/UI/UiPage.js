import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./Section/SectionsPane";
// import RunContainer from "./RunContainer/RunContainer";
// import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { Flex, Grid } from "@chakra-ui/react";
import { NO_AUTH } from "../../utils/constants";
// import TemplateUIToggle from "./TemplateUI/TemplateUIToggle";
import { loadDraftUI } from "../../dbRequests/ui";
import { setCompleteState } from "../../utils/commonFunctions";

const UiPage = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const resetSections = useStoreActions(
    (actions) => actions.master.resetSections
  );

  const masterSetEntireState = useStoreActions(
    (actions) => actions.master.setEntireState
  );

  const globalCurrSetEntireState = useStoreActions(
    (actions) => actions.globalCurr.setEntireState
  );

  const yamlEntrySetEntireState = useStoreActions(
    (actions) => actions.yamlEntry.setEntireState
  );

  const factoriesInfoSetEntireState = useStoreActions(
    (actions) => actions.factoriesInfo.setEntireState
  );

  const funcsInfoSetEntireState = useStoreActions(
    (actions) => actions.funcsInfo.setEntireState
  );

  const token = useStoreState((state) => state.auth.token);

  console.log("UiPage");

  const tryLoadingDraftUI = async () => {
    const data = await loadDraftUI({ token });
    if (data) {
      setCompleteState({
        completeState: data.completeState,
        masterSetEntireState,
        globalCurrSetEntireState,
        yamlEntrySetEntireState,
        factoriesInfoSetEntireState,
        funcsInfoSetEntireState,
      });
    }
  };

  useLayoutEffect(() => {
    if (NO_AUTH) {
      resetSections();
      loadSections();
    } else {
      tryLoadingDraftUI();
    }
  }, []);

  return (
    <>
      <Flex justify="flex-start" minW="700px">
        <Grid gap={2}>
          <SectionsPane />
        </Grid>
      </Flex>
    </>
  );
};

export default React.memo(UiPage);
