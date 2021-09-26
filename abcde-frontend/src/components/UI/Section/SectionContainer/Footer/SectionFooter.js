import { Grid, useDisclosure } from "@chakra-ui/react";
import { useState } from "react";

import CollapseSectionButton from "./CollapseSectionButton/CollapseSectionButton";
import ViewNestedButton from "./ViewNestedButton/ViewNestedButton";

// export const MenuContext = createContext(null);

export default function SectionFooter({
  sectionId,
  isListRoot,
  hasNested,
  childrenAreCollapsed,
  flipChildrenAreCollapsed,
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [selectedMenuItem, setSelectedMenuItem] = useState("");

  return (
    <>
      {/* <MenuContext.Provider value={{ sectionId }}> */}
      <Grid w="100%" py="0.5rem" alignItems="center">
        <ViewNestedButton
          isListRoot={isListRoot}
          hasNested={hasNested}
          childrenAreCollapsed={childrenAreCollapsed}
          flipChildrenAreCollapsed={flipChildrenAreCollapsed}
        />
        <CollapseSectionButton />
        {/* <GearMenu setSelectedMenuItem={setSelectedMenuItem} onOpen={onOpen} /> */}
      </Grid>
      {/* <GearModal
        name={selectedMenuItem}
        sectionId={sectionId}
        isOpen={isOpen}
        onClose={onClose}
      /> */}
      {/* </MenuContext.Provider> */}
    </>
  );
}
