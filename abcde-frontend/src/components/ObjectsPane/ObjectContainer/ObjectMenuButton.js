import React from "react";

import { HiChevronDown } from "react-icons/hi";
import { MenuButton, Button } from "@chakra-ui/react";

const ObjectMenuButton = ({ theSection }) => {
  return (
    <>
      {Object.keys(theSection.moduleInfos).length > 0 ? (
        <MenuButton as={Button} rightIcon={<HiChevronDown />}>
          Select {theSection.name}
        </MenuButton>
      ) : (
        <Button as={Button}>Edit</Button>
      )}
    </>
  );
};

export default React.memo(ObjectMenuButton);
