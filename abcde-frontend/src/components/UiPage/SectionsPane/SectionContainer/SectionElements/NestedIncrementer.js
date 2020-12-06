import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import {
  HStack,
  Button,
  Input,
  useNumberInput,
  CloseButton,
  list,
} from "@chakra-ui/react";
import {
  getParentId,
  getChildId,
  parseNestedId,
  getMaxListPosition,
  modifyId,
} from "../../../../../utils/sectionIds";

const NestedIncrementer = ({ sectionId, parentId }) => {
  const deleteFromVisibleSectionIds = useStoreActions(
    (actions) => actions.master.deleteFromVisibleSectionIds
  );

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );

  const selected = useStoreState(
    (actions) => actions.master.selected[parentId]
  );
  const sectionIdsToSectionNames = useStoreState(
    (actions) => actions.master.sectionIdsToSectionNames[sectionId]
  );

  const listSiblings = useStoreState(
    (state) => state.master.listSiblings[sectionId]
  );

  console.log("NestedIncrementer", sectionId, parentId);

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

  const addSection = () => {
    addToVisibleSectionIdsThunk({
      name: sectionIdsToSectionNames,
      sectionId: parentId,
      moduleName: selected.moduleName,
      objName: selected.name,
      isList: true,
      siblingId: sectionId,
    });
  };

  const deleteSection = () => {
    if (listSiblings && listSiblings.length > 0){
      const id = listSiblings[listSiblings.length-1]
      deleteFromVisibleSectionIds({sectionId: id, parentId});
    }
    else{
      deleteFromVisibleSectionIds({sectionId, parentId});
    }
  };

  const deleteThisSection = () => {
    deleteFromVisibleSectionIds({sectionId, parentId});
  };

  console.log("NestedIncrementer");

  return (
    <HStack maxW="10rem">
      <Button {...dec} onClick={() => deleteSection()}>
        -
      </Button>
      <Button {...inc} onClick={() => addSection()}>
        +
      </Button>
      <CloseButton size="md" onClick={() => deleteThisSection()} />
    </HStack>
  );
};

export default React.memo(NestedIncrementer);
