import { HStack, Input, useNumberInput, IconButton } from "@chakra-ui/react";
import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";

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

  const {
    getInputProps,
    getIncrementButtonProps,
    getDecrementButtonProps,
  } = useNumberInput({
    step: 1,
    defaultValue: 1,
    min: 0,
    precision: 0,
  });

  const inc = getIncrementButtonProps();
  const dec = getDecrementButtonProps();
  const input = getInputProps({ isReadOnly: false });
  return (
    <HStack maxW="320px">
      {decrementButtonCondition() && (
        <IconButton
          icon={<MinusIcon />}
          size="xs"
          {...dec}
          onClick={() => deleteSection()}
        />
      )}
      <Input size="sm" {...input} maxW="5ch" />
      <IconButton
        icon={<AddIcon />}
        size="xs"
        {...inc}
        onClick={() => addSection()}
      />
    </HStack>
  );
}
