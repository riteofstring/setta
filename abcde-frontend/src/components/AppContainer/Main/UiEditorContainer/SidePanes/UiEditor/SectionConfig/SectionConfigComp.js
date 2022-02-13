import {
  Input,
  VStack,
  List,
  ListItem,
  Checkbox,
  Box,
  Text,
  Heading,
  HStack,
  useDisclosure,
  Collapse,
} from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import _ from "lodash";
import { checkboxChangeFn } from "utils/utils";

export default function SectionConfigComp({ savedConfig, onChange }) {
  const allObjCollections = useStoreState((x) => x.master.allObjCollections);
  const allParamCollections = useStoreState(
    (x) => x.master.allParamCollections
  );
  const collections = {
    objects: allObjCollections,
    parameters: allParamCollections,
  };

  return (
    <>
      <VStack align="stretch" mt=".25rem">
        <Input placeholder="Section Config Search" bg="white" />
        <Box pt=".25rem">
          <List spacing={3}>
            {_.map(collections, (col, type) =>
              _.values(col?.children).map((x) => (
                <SearchItem
                  id={x.id}
                  name={x.name}
                  description={x.description}
                  details={x.children}
                  isChecked={savedConfig?.[type]?.includes(x.id)}
                  onChange={onChange}
                  type={type}
                  key={`SearchItem-${x.id}`}
                />
              ))
            )}
          </List>
        </Box>
      </VStack>
    </>
  );
}

function SearchItem({
  id,
  name,
  description,
  details,
  isChecked,
  onChange,
  type,
}) {
  const { isOpen, onToggle } = useDisclosure();

  function onCheckboxChange(e) {
    onChange(type, checkboxChangeFn(e, id));
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
        <Checkbox isChecked={isChecked} onChange={onCheckboxChange} />
        <VStack align="stretch" onClick={onToggle}>
          <Heading as="h2" size="md" color="gray.700">
            {name}
          </Heading>
          <Text>{description}</Text>
        </VStack>
      </HStack>
      {type === "objects" ? (
        <ObjCollectionDetails isOpen={isOpen} details={details} />
      ) : (
        <ParamCollectionDetails isOpen={isOpen} details={details} />
      )}
    </ListItem>
  );
}

function ObjCollectionDetails({ isOpen, details }) {
  const groupedDetails = useGroupedObjInfos(details);

  return (
    <Collapse in={isOpen} animateOpacity>
      <Box p="40px" color="white" mt="4" bg="teal.500" rounded="md" shadow="md">
        {_.keys(groupedDetails).map((x) => (
          <div key={`ObjCollectionDetails-${x}`}>
            <Text>{x}</Text>
            <ObjListText objList={groupedDetails[x]} />
          </div>
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

function ParamCollectionDetails({ isOpen, details }) {
  return (
    <Collapse in={isOpen} animateOpacity>
      <Box p="40px" color="white" mt="4" bg="teal.500" rounded="md" shadow="md">
        {_.map(details, (x, id) => (
          <Text key={`ParamCollectionDetails-${id}`}>{x.name}</Text>
        ))}
      </Box>
    </Collapse>
  );
}
