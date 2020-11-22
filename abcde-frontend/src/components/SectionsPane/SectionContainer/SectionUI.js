import React from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionMenu from "./SectionMenu/SectionMenu";
import { HStack, Menu, Button, Spacer } from "@chakra-ui/react";
import SectionMenuButton from "./SectionMenuButton/SectionMenuButton";

const SectionUI = ({ sectionId, visibleSectionIds, theSection }) => {
  const { setVisible } = useStoreActions((actions) => actions.master);
  const { visible } = useStoreState((state) => state.master);

  const flipVisible = () => {
    setVisible(!visible);
  };

  return (
    <HStack spacing="2rem" w="100%">
      <Menu>
        <SectionMenuButton sectionId={sectionId} theSection={theSection} />
        <SectionMenu sectionId={sectionId} theSection={theSection} />
      </Menu>
      <Spacer />
      {Object.keys(visibleSectionIds).length > 0 && (
        <Button onClick={flipVisible}>{!!visible ? "Collapse" : "Show"}</Button>
      )}
    </HStack>
  );
};

export default React.memo(SectionUI);
