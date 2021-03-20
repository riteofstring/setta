import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./Section/SectionsPane";
// import RunContainer from "./RunContainer/RunContainer";
// import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { Flex, Grid } from "@chakra-ui/react";
import { NO_AUTH } from "../../utils/constants";
// import TemplateUIToggle from "./TemplateUI/TemplateUIToggle";
import { websocketAuth } from "../../dbRequests/authentication.js";
import { resetState } from "../../store/store";

const UiPage = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);

  const token = useStoreState((state) => state.auth.token);

  const actionWebsocketTokenRetrievalSuccess = useStoreActions(
    (actions) => actions.auth.websocketTokenRetrievalSuccess
  );
  const actionWebsocketTokenRetrievalFail = useStoreActions(
    (actions) => actions.auth.websocketTokenRetrievalFail
  );

  const setCLISocket = useStoreActions(
    (actions) => actions.cliSocket.setCLISocket
  );

  const tryLoadingDraftUI = () => {
    loadUI({ token, loadType: "draft" });
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
          setCLISocket({ token: x });
        }
      });
    }
  }, []);

  return (
    <>
      <Flex justify="flex-start" h="inherit" minW="700px">
        <Grid gap={2}>
          <SectionsPane />
        </Grid>
      </Flex>
    </>
  );
};

export default React.memo(UiPage);
