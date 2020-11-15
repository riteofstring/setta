import React, { useState, useEffect } from "react";
import { useStoreActions } from "easy-peasy";
import ObjectMenu from "./ObjectMenu/ObjectMenu";
import { HStack, VStack, Heading, Menu } from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../utils/useOnClickOutsideRef";
import ObjectMenuButton from "./ObjectMenuButton";

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
          <ObjectMenuButton theSection={theSection} />
          <ObjectMenu theSection={theSection} />
        </Menu>
      </HStack>
    </VStack>
  );
};

export default React.memo(ObjectContainer);
