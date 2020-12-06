import React from "react";
import { useStoreState } from "easy-peasy";
import { HiChevronDown } from "react-icons/hi";
import { MenuButton, Button } from "@chakra-ui/react";

const SectionMenuButton = ({ theSection, sectionId }) => {
  const selected = useStoreState((state) => state.master.selected);

  const currObjectName = selected[sectionId].name;

  return (
    <>
      {Object.keys(theSection.moduleInfos).length > 0 ? (
        <MenuButton as={Button} rightIcon={<HiChevronDown />}>
          {currObjectName ? currObjectName : "Select " + theSection.name}
        </MenuButton>
      ) : (
        <Button as={Button}>Edit</Button>
      )}
    </>
  );
};

export default React.memo(SectionMenuButton);
