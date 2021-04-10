import React, { useState } from "react";
import { HStack, Input, Icon, IconButton } from "@chakra-ui/react";
import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import { HiX } from "react-icons/hi";
import { arraysAreEqual } from "../../../../../utils/commonFunctions";

export default function Incrementer({
  sectionId,
  parentId,
  nextId,
  isListRoot,
}) {
  const addChild = useStoreActions((actions) => actions.master.addChild);
  const deleteSection = useStoreActions(
    (actions) => actions.master.deleteSection
  );
  const deleteMultipleSections = useStoreActions(
    (actions) => actions.master.deleteMultipleSections
  );

  const { moduleName, objName } = useStoreState((actions) =>
    actions.master.sections.getSelected(parentId)
  );

  const childrenIds = useStoreState(
    (state) => state.master.sections.getChildrenIds(sectionId),
    arraysAreEqual
  );

  const decrementButtonCondition = () => {
    return (isListRoot && childrenIds.length > 0) || (!isListRoot && nextId);
  };

  const addSections = (numSections) => {
    for (let i = 0; i < numSections; i++) {
      addChild({
        parentId: isListRoot ? sectionId : parentId,
        sourceId: sectionId,
        moduleName,
        objName,
      });
    }
  };

  const deleteSections = (numSections) => {
    if ((isListRoot && childrenIds.length > 0) || nextId) {
      deleteMultipleSections({
        parentId: isListRoot ? sectionId : parentId,
        startingId: isListRoot ? null : nextId,
        numSectionsToDelete: numSections,
      });
    }
  };

  const deleteThisSection = () => {
    deleteSection({ sectionId, parentId });
  };

  const [numSections, setNumSections] = useState(1);
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
