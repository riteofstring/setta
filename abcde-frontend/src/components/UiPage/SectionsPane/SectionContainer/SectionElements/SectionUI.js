import React, { useState, useEffect } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import { HStack, Button, Spacer, Stack } from "@chakra-ui/react";
import SectionSearch from "./ListBox/SectionSearch";
import SectionMenu from "./SectionMenu/SectionMenu";

const SectionUI = ({ sectionId, theSection, sectionModuleObjHasNested }) => {
  const inFocus = useStoreState((state) => state.master.inFocus[sectionId]);
  const [searchFocus, setSearchFocus] = useState(false);
  const searchOnClick = (e) => {
    setSearchFocus(e);
  };

  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);

  const flipShown = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };

  useEffect(() => {
    if (!inFocus) {
      searchOnClick(false);
    }
  });

  return (
    <HStack spacing="2rem" w="100%">
      <Stack direction="column">
        <SectionSearch searchOnClick={searchOnClick} />
        {!!inFocus && !!searchFocus && (
          <SectionMenu sectionId={sectionId} theSection={theSection} />
        )}
      </Stack>
      <Spacer />

      {sectionModuleObjHasNested && (
        <Button onClick={flipShown}>{!!isShown ? "Collapse" : "Show"}</Button>
      )}
    </HStack>
  );
};

export default React.memo(SectionUI);
