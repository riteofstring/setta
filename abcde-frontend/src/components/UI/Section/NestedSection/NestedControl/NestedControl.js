import { HStack, Button, Heading } from "@chakra-ui/react";
import Incrementer from "../../Incrementer/Incrementer";
import { useStoreState, useStoreActions } from "easy-peasy";

export default function NestedControl({
  sectionId,
  parentId,
  nextId,
  isListRoot,
  idx,
}) {
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
      {isListRoot ? (
        <Incrementer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
        />
      ) : (
        <></>
      )}
      {idx === 0? (
        <Button size="sm" onClick={flipShown}>
          {!!isShown ? "Collapse" : "Show"}
        </Button>
      ) : (
        <></>
      )}
    </HStack>
  );
}
