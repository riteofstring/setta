import { Stack, HStack, Text } from "@chakra-ui/react";

import { SECTIONWIDTH } from "../../../../utils/constants";

export function DummySection() {
  return (
    <HStack
      direction="column"
      bg="gray.50"
      borderRadius="md"
      w={`${SECTIONWIDTH}px`}
    >
      <Stack px="1.5rem" py="1.5rem" w={`${SECTIONWIDTH}px`}>
        <Text>Dummy</Text>
      </Stack>
    </HStack>
  );
}
