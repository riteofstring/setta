import React, { useState, useEffect } from "react";
import { useStoreActions } from "easy-peasy";
import ObjectMenu from "./ObjectMenu/ObjectMenu";
import { HiChevronDown } from "react-icons/hi";
import {
  HStack,
  VStack,
  Heading,
  Menu,
  MenuButton,
  Button,
} from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../utils/useOnClickOutsideRef";

const ObjectContainer = ({ theSection }) => {
  const [focus, setFocus] = useState(false);

  const ref = useOnClickOutsideRef(() => setFocus(false));

  const { setActiveObj } = useStoreActions((actions) => actions.store);

  useEffect(() => {
    if (focus) {
      setActiveObj(theSection.name);
    }
  });

  return (
    <VStack
      spacing="1rem"
      width="100%"
      bg={focus ? "gray.50" : "white"}
      onClick={() => setFocus(true)}
      ref={ref}
    >
      <Heading as="h2" size="xl">
        {theSection.name}
      </Heading>

      <HStack spacing="2rem" w="100%">
        <Menu>
          {Object.keys(theSection.moduleInfos).length > 0 ? (
            <MenuButton as={Button} rightIcon={<HiChevronDown />}>
              Select Model
            </MenuButton>
          ) : (
            <MenuButton as={Button} isDisabled>
              No Models Found
            </MenuButton>
          )}
          <ObjectMenu theSection={theSection} />
        </Menu>
        {/* <Button onClick={flipVisible}>Collapse</Button> */}
      </HStack>
    </VStack>
  );
};

export default React.memo(ObjectContainer);
