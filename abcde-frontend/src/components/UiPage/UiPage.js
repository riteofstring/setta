import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./SectionsPane/SectionsPane";
import DetailsPane from "./DetailsPane/DetailsPane";
import RunContainer from "./RunContainer/RunContainer";
import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { Flex } from "@chakra-ui/react";
import { USING_ELECTRON } from "../../utils/constants";
import TemplateUIToggle from "./TemplateUI/TemplateUIToggle";

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
    if (USING_ELECTRON) {
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
      <DetailsPane />
      <Flex w="95vw" maxWidth={1600} minHeight="100vh" p="5rem">
        <SectionsPane />
      </Flex>
      {!!showTerminal && <TheTerminal />}
      <RunContainer />
    </>
  );
};

export default React.memo(UiPage);
