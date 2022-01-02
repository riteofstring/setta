import {
  Input,
  VStack,
  List,
  ListItem,
  ListIcon,
  Checkbox,
  Box,
  Text,
  Heading,
  HStack,
  useDisclosure,
  Collapse,
} from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import { useGroupedObjInfos } from "hooks/useCreateInfo";
import _ from "lodash";
import { useState } from "react";
import { IoMdCheckmarkCircle } from "react-icons/io";

export default function SectionConfigComp({ onChange }) {
  const allObjCollections = useStoreState((x) => x.master.allObjCollections);
  // const [selected, setSelected] = useState({ objects: [], parameters: [] });

  return (
    <>
      <VStack align="stretch" mt=".25rem">
        <Input placeholder="Section Config Search" bg="white" />
        <Box pt=".25rem">
          <List spacing={3}>
            {_.values(allObjCollections?.children).map((x) => (
              <SearchItem
                id={x.id}
                name={x.name}
                description={x.description}
                details={x.children}
                onChange={onChange}
                type="objects"
                key={`SearchItem-${x.id}`}
              />
            ))}
          </List>
        </Box>
      </VStack>
    </>
  );
}

function SearchItem({ id, name, description, details, onChange, type }) {
  const { isOpen, onToggle } = useDisclosure();

  function onCheckboxChange(e) {
    onChange(type, (x) =>
      e.target.checked ? [...x, id] : x.filter((y) => y !== id)
    );
  }

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
        {/* <ListIcon as={IoMdCheckmarkCircle} mr=".125rem" color="green.500" /> */}
        <Checkbox onChange={onCheckboxChange} />
        <VStack align="stretch" onClick={onToggle}>
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
  const groupedDetails = useGroupedObjInfos(details);

  return (
    <Collapse in={isOpen} animateOpacity>
      <Box p="40px" color="white" mt="4" bg="teal.500" rounded="md" shadow="md">
        {_.keys(groupedDetails).map((x) => (
          <>
            <Text key={`SearchItemDetails-${x}`}>{x}</Text>
            <ObjListText objList={groupedDetails[x]} />
          </>
        ))}
      </Box>
    </Collapse>
  );
}

function ObjListText({ objList }) {
  return objList.map((x) => (
    <div key={`ObjListText-${x.id}`} style={{ textIndent: "20px" }}>
      <Text>{x.name}</Text>
    </div>
  ));
}
