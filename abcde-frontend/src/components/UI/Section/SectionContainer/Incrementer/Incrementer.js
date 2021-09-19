import React, { useState, useContext } from "react";
import { HStack, Input, Icon, IconButton } from "@chakra-ui/react";
import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { HiX } from "react-icons/hi";
import { useStoreState, useStoreActions } from "easy-peasy";
import { ChildrenContext } from "../SectionContainer";

export default function Incrementer({
  parentId,
  sectionId,
  nextId,
  isListRoot,
  hasNested,
}) {
  const context = useContext(ChildrenContext);

  const addChild = useStoreActions((x) => x.sections.addChild);
  const deleteChild = useStoreActions((x) => x.sections.deleteChild);

  const decrementButtonCondition = () => {
    return (isListRoot && hasNested) || (!isListRoot && nextId);
  };

  const addSections = (numSections) => {
    if (isListRoot) {
      addChild({
        sectionId,
        ...context,
        numChildren: numSections,
      });
    } else {
      addChild({
        sectionId: parentId,
        ...context,
        startId: sectionId,
        numChildren: numSections,
      });
    }
  };

  const deleteChildren = (numSections) => {
    if (isListRoot) {
      deleteChild({ sectionId, ...context, numChildren: numSections });
    } else {
      deleteChild({
        sectionId: parentId,
        ...context,
        startId: nextId,
        numChildren: numSections,
      });
    }
  };

  const deleteThisSection = () => {
    deleteChild({
      sectionId: parentId,
      ...context,
      startId: sectionId,
    });
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
