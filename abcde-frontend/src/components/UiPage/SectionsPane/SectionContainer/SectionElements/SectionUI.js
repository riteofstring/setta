import React from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionMenu from "./SectionMenu/SectionMenu";
import { HStack, Menu, Button, Spacer } from "@chakra-ui/react";
import SectionMenuButton from "./SectionMenuButton";

const SectionUI = ({ sectionId, idHierarchy, theSection }) => {
  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);

  const flipVisible = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };

  return (
    <HStack spacing="2rem" w="100%">
      <Menu>
        <SectionMenuButton sectionId={sectionId} theSection={theSection} />
        <SectionMenu sectionId={sectionId} theSection={theSection} />
      </Menu>
      <Spacer />
      {Object.keys(idHierarchy).length > 0 && (
        <Button onClick={flipVisible}>{!!isShown ? "Collapse" : "Show"}</Button>
      )}
    </HStack>
  );
};

export default React.memo(SectionUI);
