import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./Section/SectionsPane";
// import RunContainer from "./RunContainer/RunContainer";
// import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { Flex, Grid } from "@chakra-ui/react";
import { NO_AUTH } from "../../utils/constants";
// import TemplateUIToggle from "./TemplateUI/TemplateUIToggle";
import { loadDraftUI } from "../../dbRequests/ui";
import { websocketAuth } from "../../dbRequests/authentication.js";
import { resetState } from "../../store/store"

const UiPage = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
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

  const actionWebsocketTokenRetrievalSuccess = useStoreActions(
    (actions) => actions.auth.websocketTokenRetrievalSuccess
  );
  const actionWebsocketTokenRetrievalFail = useStoreActions(
    (actions) => actions.auth.websocketTokenRetrievalFail
  );

  const setCLISocket = useStoreActions((actions) => actions.cliSocket.setCLISocket);

  console.log("UiPage");

  const tryLoadingDraftUI = async () => {
    const data = await loadDraftUI({ token });
    if (data) {
      const {
        masterState,
        globalCurrState,
        yamlEntryState,
        factoriesInfoState,
        funcsInfoState,
      } = JSON.parse(data.completeState);
      globalCurrSetEntireState(JSON.parse(globalCurrState));
      masterSetEntireState(JSON.parse(masterState));
      yamlEntrySetEntireState(JSON.parse(yamlEntryState));
      factoriesInfoSetEntireState(JSON.parse(factoriesInfoState));
      funcsInfoSetEntireState(JSON.parse(funcsInfoState));
    }
  };

  useLayoutEffect(() => {
    if (NO_AUTH) {
      resetState("master");
      loadSections();
    } else {
      tryLoadingDraftUI();
      websocketAuth({
        authToken: token,
        actionWebsocketTokenRetrievalSuccess,
        actionWebsocketTokenRetrievalFail,
      }).then((x) => {
        if (x) {
          setCLISocket({token: x});
        }
      });
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
