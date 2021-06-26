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
  addChild,
  deleteChild,
  parentControls,
}) {
  // const deleteSections = useStoreActions(
  //   (actions) => actions.master.deleteSections
  // );
  // const deleteChildrenAction = useStoreActions(
  //   (actions) => actions.master.deleteChildren
  // );

  // const childrenIds = useStoreState(
  //   (state) => state.master.sections.getChildrenIds(sectionId),
  //   arraysAreEqual
  // );

  // const decrementButtonCondition = () => {
  //   return (isListRoot && childrenIds.length > 0) || (!isListRoot && nextId);
  // };

  const addSections = (numSections) => {
    for (let i = 0; i < numSections; i++) {
      addChild();
    }
  };

  // const deleteChildren = (numSections) => {
  //   if ((isListRoot && childrenIds.length > 0) || nextId) {
  //     deleteChildrenAction({
  //       parentId: isListRoot ? sectionId : parentId,
  //       sourceId: sectionId,
  //       numChildren: numSections,
  //     });
  //   }
  // };

  const deleteThisSection = () => {
    parentControls.deleteChild(sectionId);
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
        // onClick={() => deleteChildren(numSections)}
        // isDisabled={decrementButtonCondition() ? false : true}
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
