import React, { useState, useContext, useEffect } from "react";
import { HStack, Input, Icon, IconButton } from "@chakra-ui/react";
import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { HiX } from "react-icons/hi";
import { ChildrenContext } from "../SectionContainer";

export default function Incrementer({
  sectionId,
  nextId,
  isListRoot,
  addChild,
  deleteChild,
  parentControls,
  hasNested,
}) {
  const { updateRequested, setUpdateRequested } = useContext(ChildrenContext);

  useEffect(() => {
    if (!updateRequested || updateRequested.sectionId !== sectionId) {
      return;
    }
    const { command, numSections } = updateRequested;
    console.log("updateRequested", updateRequested)
    if (command === "addChild") {
      parentControls.addChildOnRequest(null, null, sectionId, numSections);
    } else if (command === "deleteChild") {
      parentControls.deleteChildOnRequest(nextId, numSections);
    } else if (command === "deleteThisSection") {
      parentControls.deleteChildOnRequest(sectionId);
    }
    setUpdateRequested(false);
  }, [updateRequested]);

  const decrementButtonCondition = () => {
    return (isListRoot && hasNested) || (!isListRoot && nextId);
  };

  const addSections = (numSections) => {
    if (isListRoot) {
      addChild(null, null, null, numSections);
    } else {
      setUpdateRequested({ sectionId, command: "addChild", numSections });
    }
  };

  const deleteChildren = (numSections) => {
    if (isListRoot) {
      deleteChild(null, numSections);
    } else {
      setUpdateRequested({ sectionId, command: "deleteChild", numSections });
    }
  };

  const deleteThisSection = () => {
    setUpdateRequested({
      sectionId,
      command: "deleteThisSection",
      numSections,
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
