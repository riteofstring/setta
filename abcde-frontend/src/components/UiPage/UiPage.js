import React, { useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionsPane from "./SectionsPane/SectionsPane";
import DetailsPane from "./DetailsPane/DetailsPane";
import RunContainer from "./RunContainer/RunContainer";
import TheTerminal from "./RunContainer/Terminal/TheTerminal";
import { Flex } from "@chakra-ui/react";

const UiPage = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const loadSectionsIsDone = useStoreState(
    (state) => state.master.loadSectionsIsDone
  );

  const showTerminal = useStoreState((state) => state.master.showTerminal);

  useLayoutEffect(() => {
    if (!loadSectionsIsDone) {
      loadSections();
    }
  }, [loadSectionsIsDone]);

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
