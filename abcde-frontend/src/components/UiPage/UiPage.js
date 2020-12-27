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

  const loadSectionsIsDone = useStoreState(
    (state) => state.master.loadSectionsIsDone
  );

  console.log("UiPage");

  useLayoutEffect(() => {
    if (!loadSectionsIsDone) {
      console.log("loading sections");
      loadSections();
    }
  }, [loadSectionsIsDone]);

  return (
    <>
      <DetailsPane />
      <Flex w="95vw" maxWidth={1600} minHeight="100vh" p="5rem">
        <SectionsPane />
      </Flex>
      <Submit />
    </>
  );
};

export default React.memo(UiPage);
