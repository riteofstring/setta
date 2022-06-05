import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { HStack, Input, IconButton, Heading } from "@chakra-ui/react";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import React, { useState } from "react";

export default function Incrementer({
  parentId,
  sectionId,
  nextId,
  isListRoot,
  addChild,
  deleteChild,
  hasNested,
}) {
  console.log("Incrementer");
  const addSibling = useAddChild(parentId);
  const deleteSibling = useDeleteChild(parentId);

  const decrementButtonCondition = () => {
    return (isListRoot && hasNested) || (!isListRoot && nextId);
  };

  const addSections = (numSections) => {
    if (isListRoot) {
      addChild({ numChildren: numSections });
    } else {
      addSibling({ numChildren: numSections, startId: sectionId });
    }
  };

  const deleteChildren = (numSections) => {
    if (isListRoot) {
      deleteChild({ numChildren: numSections });
    } else {
      deleteSibling({ numChildren: numSections, startId: nextId });
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
        {isListRoot && "Children: "}
      </Heading>
      <Input
        size="xs"
        maxW="5ch"
        value={numSections}
        onChange={(e) => numSectionsOnChange(e.target.value)}
        aria-label="Number of sections"
        bg="white"
        borderRadius="md"
      />

      <IconButton
        icon={<MinusIcon />}
        size="xs"
        onClick={() => deleteChildren(numSections)}
        isDisabled={!decrementButtonCondition()}
        aria-label="Delete child section"
        borderRadius="full"
      />

      <IconButton
        icon={<AddIcon />}
        size="xs"
        onClick={() => addSections(numSections)}
        aria-label="Add child section"
        borderRadius="full"
      />
    </HStack>
  );
}
