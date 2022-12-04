import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { Heading, HStack, IconButton, Input } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useState } from "react";
import { addChild } from "thunks/addChild";

export default function Incrementer({
  parentId,
  sectionId,
  nextId,
  isRoot,
  hasNested,
}) {
  const deleteChild = useStoreActions((x) => x.thunks.deleteChild);

  const decrementButtonCondition = () => {
    return (isRoot && hasNested) || (!isRoot && nextId);
  };

  const addSections = (numSections) => {
    if (isRoot) {
      addChild({ parentId: sectionId, numChildren: numSections });
    } else {
      addChild({ parentId, numChildren: numSections, startId: sectionId });
    }
  };

  const deleteChildren = (numSections) => {
    if (isRoot) {
      deleteChild({ sectionId, numChildren: numSections });
    } else {
      deleteChild({
        sectionId: parentId,
        numChildren: numSections,
        startId: nextId,
      });
    }
  };
  const numSectionsOnChange = (value) => {
    if (value && !isNaN(value)) {
      setNumSections(parseInt(value));
    } else {
      setNumSections("");
    }
  };

  const [numSections, setNumSections] = useState(1);
  return (
    <HStack maxW="320px" bg="gray.100" borderRadius="xl" p="0.25rem 0.5rem">
      <Heading as="h3" fontSize=".75em" color="gray.400">
        {isRoot && "Children: "}
      </Heading>
      <Input
        size="xs"
        maxW="5ch"
        value={numSections}
        onChange={(e) => numSectionsOnChange(e.target.value)}
        aria-label="Number of sections"
        bg="white"
        borderRadius="md"
        className="nodrag"
      />

      <IconButton
        icon={<MinusIcon />}
        size="xs"
        onClick={() => deleteChildren(numSections)}
        isDisabled={!decrementButtonCondition()}
        aria-label="Delete child section"
        borderRadius="full"
        className="nodrag"
      />

      <IconButton
        icon={<AddIcon />}
        size="xs"
        onClick={() => addSections(numSections)}
        aria-label="Add child section"
        borderRadius="full"
        className="nodrag"
      />
    </HStack>
  );
}
