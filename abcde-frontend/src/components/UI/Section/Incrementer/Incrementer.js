import React, { useState } from "react";
import {
  HStack,
  Input,
  useNumberInput,
  Icon,
  IconButton,
} from "@chakra-ui/react";
import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import { HiX } from "react-icons/hi";

export default function Incrementer({
  sectionId,
  parentId,
  childrenIds,
  nextId,
  isListRoot,
}) {
  const permanentlyDeleteSection = useStoreActions(
    (actions) => actions.master.permanentlyDeleteSection
  );

  const permanentlyDeleteMultipleSections = useStoreActions(
    (actions) => actions.master.permanentlyDeleteMultipleSections
  );

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );

  const selected = useStoreState(
    (actions) => actions.master.selected[parentId]
  );
  const sectionIdsToSectionHeadings = useStoreState(
    (actions) => actions.master.sectionIdsToSectionHeadings[sectionId]
  );

  const decrementButtonCondition = () => {
    return (isListRoot && childrenIds.length > 0) | (!isListRoot && nextId);
  };

  const addSections = (numSections) => {
    for (let i = 0; i < numSections; i++) {
      addToVisibleSectionIdsThunk({
        name: sectionIdsToSectionHeadings,
        parentId: isListRoot ? sectionId : parentId,
        moduleName: selected.moduleName,
        objName: selected.name,
        isList: true,
        siblingId: sectionId,
      });
    }
  };

  const deleteSections = (numSections) => {
    if ((isListRoot && childrenIds.length > 0) | nextId) {
      permanentlyDeleteMultipleSections({
        parentId: sectionId,
        numSectionsToDelete: numSections,
      });
    }
  };

  const deleteThisSection = () => {
    permanentlyDeleteSection({ sectionId, parentId });
  };

  const [numSections, setNumSections] = useState(1);
  console.log(decrementButtonCondition());
  return (
    <HStack maxW="320px">
      <Input
        size="sm"
        maxW="5ch"
        value={numSections}
        onChange={(e) => setNumSections(e.target.value)}
      />

      <IconButton
        icon={<MinusIcon />}
        size="xs"
        onClick={() => deleteSections(numSections)}
        isDisabled={decrementButtonCondition() ? false : true}
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
