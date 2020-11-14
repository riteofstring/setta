import React from "react";
import ObjectMenu from "./ObjectMenu/ObjectMenu";
import { useState } from "react";
import {
  SimpleGrid,
  VStack,
  Heading,
  Menu,
  MenuButton,
  Button,
} from "@chakra-ui/react";

const ObjectContainer = ({ theSection }) => {
  const [visible, setVisible] = useState(true);
  const flipVisible = () => {
    setVisible(!visible);
  };

  return (
    <VStack ml={20} spacing="20px">
      <Heading as="h2" size="xl">
        {theSection.name}
      </Heading>

      <SimpleGrid minChildWidth="120px" spacing="2rem">
        <Menu>
          {theSection.moduleInfos.length > 0 ? (
            <MenuButton as={Button} rightIcon="chevron-down">
              Select Model
            </MenuButton>
          ) : (
            <MenuButton as={Button} rightIcon="chevron-down" isDisabled>
              No Models Found
            </MenuButton>
          )}
          <ObjectMenu theSection={theSection} />
        </Menu>
        <Button onClick={flipVisible}>Collapse</Button>
      </SimpleGrid>
    </VStack>
  );
};

export default ObjectContainer;
