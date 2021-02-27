import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { HStack, Button, useNumberInput, CloseButton } from "@chakra-ui/react";

const NestedIncrementer = ({ sectionId, parentId, childrenIds, nextId }) => {
  const isListRoot = useStoreState((state) => state.master.isListRoot[sectionId]);

  const permanentlyDeleteSection = useStoreActions(
    (actions) => actions.master.permanentlyDeleteSection
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

  const { getIncrementButtonProps, getDecrementButtonProps } = useNumberInput({
    step: 1,
  });

  const inc = getIncrementButtonProps();
  const dec = getDecrementButtonProps();

  const addSection = () => {
    addToVisibleSectionIdsThunk({
      name: sectionIdsToSectionHeadings,
      parentId: isListRoot ? sectionId : parentId,
      moduleName: selected.moduleName,
      objName: selected.name,
      isList: true,
      siblingId: sectionId,
    });
  };

  const deleteSection = () => {
    if (isListRoot && childrenIds.length > 0) {
      permanentlyDeleteSection({
        sectionId: childrenIds[0],
        parentId: sectionId,
      });
    } else if (nextId) {
      permanentlyDeleteSection({ sectionId: nextId, parentId });
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
