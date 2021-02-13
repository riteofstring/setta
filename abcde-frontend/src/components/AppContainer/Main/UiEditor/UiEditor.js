import { GridItem, Flex, Heading, IconButton, Box } from "@chakra-ui/react";
import {
  HiChevronRight,
  // HiChevronLeft,
} from "react-icons/hi";

export default function UiEditor() {
  return (
    <GridItem
      maxW="35vw"
      colStart="3"
      colEnd="4"
      rowStart="2"
      rowEnd="3"
      zIndex="2"
    >
      <Flex
        direction="row-reverse"
        minW="35vw"
        bg="gray.50"
        h="100%"
        py="2rem"
        pr="3rem"
        pl="0rem"
      >
        <Flex w="100%" direction="column">
          <Heading as="h1" size="md" color="gray.500">
            Edit YAML
          </Heading>
          <Box
            mt="1rem"
            w="100%"
            h="100%"
            borderRadius=".5rem"
            bg="gray.200"
          ></Box>
        </Flex>

        <IconButton
          icon={<HiChevronRight />}
          color="gray.500"
          bg="whiteAlpha"
          size="sm"
          ml="0.25rem"
          mr="0.5rem"
          alignSelf="center"
        />
      </Flex>
    </GridItem>
  );
}
