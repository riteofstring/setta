import { Stack, HStack, Heading, FormControl } from "@chakra-ui/react";
import TheParam from "./TheParam/TheParam";

import PinButton from "./TheParam/PinButton/PinButton";

export default function GroupContainer() {
  return (
    <Stack
      px="1.5rem"
      py="1rem"
      border="1px"
      borderColor="gray.300"
      borderRadius="md"
    >
      <HStack>
        <Heading as="h3" color="gray.400" size="md" fontWeight="bold">
          Group One
        </Heading>
        <PinButton />
      </HStack>
      <FormControl id="groupone">
        <TheParam />
      </FormControl>
    </Stack>
  );
}
