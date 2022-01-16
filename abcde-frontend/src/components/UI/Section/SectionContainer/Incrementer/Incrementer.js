import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { HStack, Input, Icon, IconButton } from "@chakra-ui/react";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import React, { useState } from "react";
import { HiX } from "react-icons/hi";

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
  const deleteSelf = useDeleteChild(parentId);

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

  const deleteThisSection = () => {
    deleteSelf({ startId: sectionId });
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
    <HStack maxW="320px">
      <Input
        size="sm"
        maxW="5ch"
        value={numSections}
        onChange={(e) => numSectionsOnChange(e.target.value)}
      />

      <IconButton
        icon={<MinusIcon />}
        size="xs"
        onClick={() => deleteChildren(numSections)}
        isDisabled={!decrementButtonCondition()}
      />

      <IconButton
        icon={<AddIcon />}
        size="xs"
        onClick={() => addSections(numSections)}
      />
      {!isListRoot && (
        <IconButton
          bg="whiteAlpha"
          icon={<Icon as={HiX} onClick={() => deleteThisSection()} />}
        />
      )}
    </HStack>
  );
}
