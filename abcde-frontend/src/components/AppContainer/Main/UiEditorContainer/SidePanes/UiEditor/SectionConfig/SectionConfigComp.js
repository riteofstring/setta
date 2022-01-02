import {
  Input,
  VStack,
  List,
  ListItem,
  ListIcon,
  Box,
  Text,
  Heading,
  HStack,
} from "@chakra-ui/react";
import { IoMdCheckmarkCircle } from "react-icons/io";

export default function SectionConfigComp() {
  return (
    <>
      <VStack align="stretch" mt=".25rem">
        <Input placeholder="Section Search" bg="white" />
        <Box pt=".25rem">
          <List spacing={3}>
            <SearchItem />
            <SearchItem />
            <SearchItem />
            <SearchItem />
          </List>
        </Box>
      </VStack>
    </>
  );
}

function SearchItem(props) {
  return (
    <ListItem
      px=".75rem"
      py=".75rem"
      borderRadius="2xl"
      cursor="pointer"
      _hover={{
        background: "white",
        boxShadow: "sm",
        borderColor: "white",
        transition: "box-shadow 200ms, background 200ms",
      }}
      border="1px"
      borderColor="rgba(0, 0, 0, 0)"
    >
      <HStack align="stretch">
        <ListIcon as={IoMdCheckmarkCircle} mr=".125rem" color="green.500" />
        <VStack align="stretch">
          <Heading as="h2" size="md" color="gray.700">
            Test Item Title
          </Heading>
          <Text>Lorem ipsum dolor sit amet, consectetur adipisicing elit</Text>
        </VStack>
      </HStack>
    </ListItem>
  );
}
