import { Grid, useDisclosure } from "@chakra-ui/react";

import { createContext, useState } from "react";

import ViewNestedButton from "./ViewNestedButton/ViewNestedButton";
import CollapseSectionButton from "./CollapseSectionButton/CollapseSectionButton";
import GearMenu from "./GearMenu/GearMenu";
import GearModal from "./GearModal/GearModal";

// export const MenuContext = createContext(null);

export default function SectionFooter({ sectionId, isListRoot }) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [selectedMenuItem, setSelectedMenuItem] = useState("");

  return (
    <>
      {/* <MenuContext.Provider value={{ sectionId }}> */}
      <Grid w="100%" py="0.5rem" alignItems="center">
        {/* <ViewNestedButton sectionId={sectionId} isListRoot={isListRoot} /> */}
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
