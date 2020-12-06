import React from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionMenu from "./SectionMenu/SectionMenu";
import { HStack, Menu, Button, Spacer } from "@chakra-ui/react";
import SectionMenuButton from "./SectionMenuButton";
import { createStringId } from "../../../../../utils/sectionIds";

const SectionUI = ({ sectionId, theSection }) => {
  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);
  const selected = useStoreState((state) => state.master.selected[sectionId]);
  const stringId = createStringId(sectionId, selected.moduleName, selected.name);
  const sectionModuleObjHasNested = useStoreState(
    (state) => state.master.sectionModuleObjHasNested[stringId]
  );

  console.log("SectionUI", stringId)

  const flipShown = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };

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
