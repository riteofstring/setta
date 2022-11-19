import { HStack, Stack, Text } from "@chakra-ui/react";
import React from "react";
import { SECTIONWIDTH } from "utils/constants";

export const DummySection = React.forwardRef(({ zoom }, ref) => {
  return (
    <HStack
      direction="column"
      bg="gray.50"
      borderRadius="md"
      w={`${SECTIONWIDTH * zoom}px`}
      ref={ref}
    >
      <Stack px="1.5rem" py="1.5rem" w={`${SECTIONWIDTH}px`}>
        <Text>Dummy</Text>
      </Stack>
    </HStack>
  );
});
