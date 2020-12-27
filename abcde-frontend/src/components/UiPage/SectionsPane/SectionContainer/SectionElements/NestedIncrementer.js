import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { HStack, Button, useNumberInput, CloseButton } from "@chakra-ui/react";

const NestedIncrementer = ({ sectionId, parentId, isListRoot }) => {
  const permanentlyDeleteSection = useStoreActions(
    (actions) => actions.master.permanentlyDeleteSection
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

  const decrementButtonCondition = () => {
    const minLength = isListRoot ? 0 : 1;
    return listSiblings && listSiblings.length > minLength;
  };

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
    if (listSiblings && listSiblings.length > 0) {
      const id = listSiblings[listSiblings.length - 1];
      permanentlyDeleteSection({ sectionId: id, parentId });
    }
  };

  const deleteThisSection = () => {
    permanentlyDeleteSection({ sectionId, parentId });
  };

  return (
    <HStack maxW="10rem">
      {decrementButtonCondition() && (
        <Button {...dec} onClick={() => deleteSection()}>
          -
        </Button>
      )}
      <Button {...inc} onClick={() => addSection()}>
        +
      </Button>
      {!isListRoot && (
        <CloseButton size="md" onClick={() => deleteThisSection()} />
      )}
    </HStack>
  );
};

export default React.memo(NestedIncrementer);
