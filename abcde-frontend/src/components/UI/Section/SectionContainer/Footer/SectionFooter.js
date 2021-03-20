import { Grid, useDisclosure } from "@chakra-ui/react";

import GearModal from "./GearModal/GearModal";
import { createContext } from "react";

import ViewNestedButton from "./ViewNestedButton/ViewNestedButton";
import CollapseSectionButton from "./CollapseSectionButton/CollapseSectionButton";
import GearMenu from "./GearMenu/GearMenu";

export const MenuContext = createContext(null);

export default function SectionFooter({ sectionId, isListRoot }) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <MenuContext.Provider value={{ isOpen, onOpen, onClose }}>
        <Grid w="100%" py="0.5rem" alignItems="center">
          <ViewNestedButton sectionId={sectionId} isListRoot={isListRoot} />
          <CollapseSectionButton />
          <GearMenu />
        </Grid>
        <GearModal />
      </MenuContext.Provider>
    </>
  );
}
