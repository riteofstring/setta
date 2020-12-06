import React from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionMenu from "./SectionMenu/SectionMenu";
import { HStack, Menu, Button, Spacer } from "@chakra-ui/react";
import SectionMenuButton from "./SectionMenuButton";
import { createStringId } from "../../../../../utils/sectionIds";

const SectionUI = ({ sectionId, theSection, sectionModuleObjHasNested }) => {
  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);
  console.log("SectionUI", sectionId);

  const flipShown = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };

  console.log("####################SectionUI", sectionId);

  return (
    <HStack spacing="2rem" w="100%">
      <Menu>
        <SectionMenuButton sectionId={sectionId} theSection={theSection} />
        <SectionMenu sectionId={sectionId} theSection={theSection} />
      </Menu>
      <Spacer />
      {sectionModuleObjHasNested && (
        <Button onClick={flipShown}>{!!isShown ? "Collapse" : "Show"}</Button>
      )}
    </HStack>
  );
};

export default React.memo(SectionUI);
