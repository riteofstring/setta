import React from "react";
import ObjectMenu from "../ObjectMenu/ObjectMenu";
import { useState } from "react";
import { Flex, Menu, MenuButton, Button } from "@chakra-ui/core";

const ObjectSelect = ({ theSection }) => {
  const [visible, setVisible] = useState(true);
  const flipVisible = () => {
    setVisible(!visible);
  };

  return (
    <Flex flexDir="column" ml={20}>
      {theSection.name}
      <Flex>
        <Menu>
          <MenuButton as={Button} rightIcon="chevron-down">
            Select Model
          </MenuButton>
          <ObjectMenu theSection={theSection} />
        </Menu>
        <Button onClick={flipVisible}>Collapse</Button>
      </Flex>
      {/* {!!nested && (
        <Flex flexDir="column" display={visible ? "flex" : "none"}>
          <ObjectSelect />
        </Flex>
      )} */}
    </Flex>
  );
};

export default ObjectSelect;
