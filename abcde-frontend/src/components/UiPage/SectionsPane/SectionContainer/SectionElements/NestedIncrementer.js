import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import {
  HStack,
  Button,
  Input,
  useNumberInput,
  CloseButton,
} from "@chakra-ui/react";
import {
  getParentId,
  getChildId,
  parseNestedId,
  getMaxListPosition,
  modifyId,
} from "../../../../../utils/sectionIds";

const NestedIncrementer = ({ sectionId }) => {
  const visibleSectionIds = useStoreState(
    (state) => state.master.visibleSectionIds
  );
  const modifyVisibleSectionIds = useStoreActions(
    (actions) => actions.master.modifyVisibleSectionIds
  );
  const setIsList = useStoreActions((actions) => actions.master.setIsList);

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

  const listPosition = parseNestedId(getChildId(sectionId)).listPosition;

  const modifySections = (command) => {
    const parentId = getParentId(sectionId);
    const paramName = parseNestedId(getChildId(sectionId)).paramName;
    const currMaxPosition = getMaxListPosition(
      parentId,
      visibleSectionIds,
      paramName
    );
    if (command === "delete" && currMaxPosition === 0) {
      return;
    }
    const newId = modifyId({
      id: sectionId,
      listPosition: command === "add" ? currMaxPosition + 1 : currMaxPosition,
    });
    modifyVisibleSectionIds({
      fullId: newId,
      command: command,
    });
    return newId;
  };

  const addSection = () => {
    const newId = modifySections("add");
    setIsList({ sectionId: newId, isList: true });
  };

  const deleteSection = () => {
    modifySections("delete");
  };

  const deleteThisSection = () => {
    modifyVisibleSectionIds({
      fullId: sectionId,
      command: "delete",
    });
  };

  console.log("NestedIncrementer")

  return (
    <HStack maxW="10rem">
      <Button {...dec} onClick={() => deleteSection()}>
        -
      </Button>
      <Button {...inc} onClick={() => addSection()}>
        +
      </Button>
      {listPosition !== "0" && (
        <CloseButton size="md" onClick={() => deleteThisSection()} />
      )}
    </HStack>
  );
};

export default React.memo(NestedIncrementer);
