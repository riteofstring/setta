import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./Section/SectionsPane";
// import RunContainer from "./RunContainer/RunContainer";
// import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { Flex, Grid } from "@chakra-ui/react";
import { NO_AUTH } from "../../utils/constants";
// import TemplateUIToggle from "./TemplateUI/TemplateUIToggle";

const UiPage = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const resetSections = useStoreActions(
    (actions) => actions.master.resetSections
  );

  const loadSectionsIsDone = useStoreState(
    (state) => state.master.loadSectionsIsDone
  );

  const showTerminal = useStoreState((state) => state.master.showTerminal);

  const specsAreReady = useStoreState((state) => state.devPage.specsAreReady);
  const uiAsJson = useStoreState((state) => state.devPage.uiAsJson);

  console.log("UiPage");

  useLayoutEffect(() => {
    if (!NO_AUTH) {
      if (specsAreReady && !loadSectionsIsDone) {
        resetSections();
        loadSections(uiAsJson);
      }
    } else if (!loadSectionsIsDone) {
      resetSections();
      loadSections();
    }
  }, [specsAreReady]);

  return (
    <>
      <Flex justify="flex-start">
        <Grid gap={2}>
          <SectionsPane />
        </Grid>
      </Flex>
      {/* {!!showTerminal && <TheTerminal />} */}
    </>
  );
};

export default React.memo(UiPage);
