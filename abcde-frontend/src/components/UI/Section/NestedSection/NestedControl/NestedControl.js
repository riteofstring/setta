import { HStack, Button, Heading } from "@chakra-ui/react";
import Incrementer from "./Incrementer";

export default function NestedControl() {
  return (
    <HStack justifyContent="space-between" w="100%">
      <Heading
        size="md"
        fontWeight="light"
        letterSpacing="tighter"
        color="gray.500"
        as="h2"
      >
        Nested Sections
      </Heading>
      <Incrementer />
      <Button size="sm">Hide</Button>
    </HStack>
  );
}
