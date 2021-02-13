import {
  Flex,
  Heading,
  Box,
  GridItem,
  HStack,
  Spacer,
  IconButton,
} from "@chakra-ui/react";
import {
  // HiChevronRight,
  HiChevronLeft,
} from "react-icons/hi";
import SectionList from "./SectionList/SectionList";

export default function Overview() {
  return (
    <GridItem colStart="1" colEnd="2" rowStart="2" rowEnd="3" zIndex="5">
      <Box
        display="inline-block"
        height="100%"
        borderRight="1px"
        borderColor="gray.100"
      >
        <HStack h="100%">
          <Flex
            bg="white"
            flexDirection="column"
            height="100%"
            py="1.25rem"
            px="1.5rem"
            minWidth="15rem"
          >
            <Heading as="h2" size="md" color="gray.500" pb=".5rem">
              Overview
            </Heading>
            <SectionList />
          </Flex>
          <Spacer />
          <IconButton
            icon={<HiChevronLeft />}
            color="gray.500"
            bg="whiteAlpha"
            size="sm"
            mr="0.25rem"
          />
        </HStack>
      </Box>
    </GridItem>
  );
}
