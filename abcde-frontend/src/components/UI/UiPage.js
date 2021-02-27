import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./Section/SectionsPane";
// import RunContainer from "./RunContainer/RunContainer";
// import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { Flex, Grid } from "@chakra-ui/react";
import { NO_AUTH } from "../../utils/constants";
// import TemplateUIToggle from "./TemplateUI/TemplateUIToggle";
import { loadDraftUI } from "../../dbRequests/ui";

const UiPage = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const resetSections = useStoreActions(
    (actions) => actions.master.resetSections
  );

  const token = useStoreState((state) => state.auth.token);

  console.log("UiPage");

  const tryLoadingDraftUI = async () => {
    const data = await loadDraftUI({ token });
    if (data){
      const {sections, selected, globalCurr} = data
      loadSections({isJson: false, data: JSON.parse(sections)})
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
