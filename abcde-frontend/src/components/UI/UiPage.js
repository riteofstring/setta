// import RunContainer from "./RunContainer/RunContainer";
// import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";

// import TemplateUIToggle from "./TemplateUI/TemplateUIToggle";
// import { websocketAuth } from "../../dbRequests/authentication.js";
// import { resetState } from "../../store/store";
import SectionsPane from "./Section/SectionsPane";

const UiPage = ({ setReactFlowInstance }) => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);

  const token = useStoreState((state) => state.auth.token);
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  const isNewSession = useStoreState((state) => state.auth.isNewSession);

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

  useEffect(() => {
    console.log(
      "UiPage, isAuthenticated, isNewSession",
      isAuthenticated,
      isNewSession
    );
    if (isAuthenticated && isNewSession) {
      console.log("****loadSections****");
      // resetState("master");
      loadSections();
    }
    // } else {
    //   // tryLoadingDraftUI();
    //   websocketAuth({
    //     authToken: token,
    //     actionWebsocketTokenRetrievalSuccess,
    //     actionWebsocketTokenRetrievalFail,
    //   }).then((x) => {
    //     if (x) {
    //       setCLISocket({ token: x });
    //     }
    //   });
    // }
  }, [isAuthenticated, isNewSession]);

  return (
    <>
      {/* <Flex justify="flex-start" h="inherit"> */}
      {/* <Grid gap={2}> */}
      <SectionsPane setReactFlowInstance={setReactFlowInstance} />
      {/* </Grid> */}
      {/* </Flex> */}
    </>
  );
};

export default React.memo(UiPage);
