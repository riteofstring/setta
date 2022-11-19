import { HStack, Stack, Text } from "@chakra-ui/react";

import { SECTIONWIDTH } from "utils/constants";

export function DummySection({ zoom }) {
  return (
    <HStack
      direction="column"
      bg="gray.50"
      borderRadius="md"
      w={`${SECTIONWIDTH * zoom}px`}
    >
      <Stack px="1.5rem" py="1.5rem" w={`${SECTIONWIDTH}px`}>
        <Text>Dummy</Text>
      </Stack>
    </HStack>
  );
}
