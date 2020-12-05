import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { HStack, Button, Input, useNumberInput } from "@chakra-ui/react";
import {
  getParentId,
  getChildId,
  parseNestedId,
  getNestedListLength,
  modifyId,
} from "../../../../../utils/sectionIds";

const NestedIncrementer = ({ sectionId }) => {
  const { visibleSectionIds } = useStoreState((state) => state.master);
  const { modifyVisibleSectionIds } = useStoreActions(
    (actions) => actions.master
  );

  const {
    getInputProps,
    getIncrementButtonProps,
    getDecrementButtonProps,
  } = useNumberInput({
    step: 1,
  });

  const inc = getIncrementButtonProps();
  const dec = getDecrementButtonProps();
  const input = getInputProps({ isReadOnly: true });

  const modifySections = (command) => {
    const parentId = getParentId(sectionId);
    const paramName = parseNestedId(getChildId(sectionId)).paramName;
    const listLength = getNestedListLength(
      parentId,
      visibleSectionIds,
      paramName
    );
    if (command === "delete" && listLength === 1) {
      return;
    }
    const newId = modifyId({
      id: sectionId,
      paramName,
      listPosition: command === "add" ? listLength : listLength - 1,
    });
    modifyVisibleSectionIds({
      fullId: newId,
      command: command,
    });
  };

  const addSection = () => {
    modifySections("add");
  };

  const deleteSection = () => {
    modifySections("delete");
  };

  return (
    <HStack maxW="10rem">
      <Button {...dec} onClick={() => deleteSection()}>
        -
      </Button>
      <Button {...inc} onClick={() => addSection()}>
        +
      </Button>
    </HStack>
  );
};

export default React.memo(NestedIncrementer);
