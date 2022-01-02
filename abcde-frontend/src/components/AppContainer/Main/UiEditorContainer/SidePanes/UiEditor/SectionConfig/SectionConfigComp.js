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
  useDisclosure,
  Collapse,
} from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { IoMdCheckmarkCircle } from "react-icons/io";

export default function SectionConfigComp() {
  const allObjCollections = useStoreState((x) => x.master.allObjCollections);

  return (
    <>
      <VStack align="stretch" mt=".25rem">
        <Input placeholder="Section Config Search" bg="white" />
        <Box pt=".25rem">
          <List spacing={3}>
            {_.values(allObjCollections?.children).map((x) => (
              <SearchItem
                key={`SearchItem-${x.id}`}
                name={x.name}
                description={x.description}
                details={x.children}
              />
            ))}
          </List>
        </Box>
      </VStack>
    </>
  );
}

function SearchItem({ name, description, details }) {
  const { isOpen, onToggle } = useDisclosure();

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
      onClick={onToggle}
    >
      <HStack align="stretch">
        <ListIcon as={IoMdCheckmarkCircle} mr=".125rem" color="green.500" />
        <VStack align="stretch">
          <Heading as="h2" size="md" color="gray.700">
            {name}
          </Heading>
          <Text>{description}</Text>
        </VStack>
      </HStack>
      <SearchItemDetails isOpen={isOpen} details={details} />
    </ListItem>
  );
}

function SearchItemDetails({ isOpen, details }) {
  const groupedDetails = _.groupBy(details, (x) => x.parentId);
  console.log("groupedDetails", groupedDetails);
  return (
    <Collapse in={isOpen} animateOpacity>
      <Box p="40px" color="white" mt="4" bg="teal.500" rounded="md" shadow="md">
        {_.values(details).map((x) => (
          <Text key={`SearchItemDetails-${x.id}`}>{x.name}</Text>
        ))}
      </Box>
    </Collapse>
  );
}
