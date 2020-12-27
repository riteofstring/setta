import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./SectionsPane/SectionsPane";
import DetailsPane from "./DetailsPane/DetailsPane";
import Submit from "./Submit/Submit";
import { Flex } from "@chakra-ui/react";

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

  const specsAreReady = useStoreState((state) => state.devPage.specsAreReady);

  console.log("UiPage");

  useLayoutEffect(() => {
    if (specsAreReady && !loadSectionsIsDone) {
      resetSections();
      loadSections();
    }
  }, [specsAreReady]);

  return specsAreReady ? (
    <>
      <DetailsPane />
      <Flex w="95vw" maxWidth={1600} minHeight="100vh" p="5rem">
        <SectionsPane />
      </Flex>
      <Submit />
    </>
  ) : (
    <></>
  );
};

export default React.memo(UiPage);
