import { HStack, Button, Heading } from "@chakra-ui/react";
import Incrementer from "./Incrementer";
import { useStoreState, useStoreActions } from "easy-peasy";

export default function NestedControl({ sectionId, parentId, nextId }) {
  const isList = useStoreState((state) => state.master.isList[sectionId]);
  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[parentId]);

  const flipShown = () => {
    setIsShown({ sectionId: parentId, isShown: !isShown });
  };

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
      {isList ? (
        <Incrementer sectionId={sectionId} parentId={parentId} nextId={nextId}/>
      ) : (
        <></>
      )}
      <Button size="sm" onClick={flipShown}>
        {!!isShown ? "Collapse" : "Show"}
      </Button>
    </HStack>
  );
}
