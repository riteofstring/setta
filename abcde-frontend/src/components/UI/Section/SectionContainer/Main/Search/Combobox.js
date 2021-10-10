import { SearchIcon } from "@chakra-ui/icons";
import { InputLeftElement, Input, List, ListItem } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import React from "react";

export const ComboboxInput = React.forwardRef(({ ...props }, ref) => {
  return (
    <>
      <InputLeftElement pointerEvents="none">
        <SearchIcon color="gray.300" />
      </InputLeftElement>
      <Input
        w="100%"
        pl="2.5rem"
        mr="0.5rem"
        {...props}
        ref={ref}
        placeholder="Search"
      />
    </>
  );
});

export const ComboboxList = React.forwardRef(({ isOpen, ...props }, ref) => {
  return <List display={isOpen ? null : "none"} py={2} {...props} ref={ref} />;
});

export const ComboboxItem = React.forwardRef(
  ({ itemIndex, highlightedIndex, ...props }, ref) => {
    const isActive = itemIndex === highlightedIndex;

    return (
      <ListItem
        transition="background-color 220ms, color 220ms"
        bg={isActive ? "gray.500" : null}
        color={isActive ? "white" : "gray.700"}
        px={4}
        py={2}
        cursor="pointer"
        {...props}
        ref={ref}
        borderRadius="0.5rem"
        mx="0.25rem"
        my="0.125rem"
      />
    );
  }
);

function resetToPreviousVal(state, changes) {
  const sname = state.selectedItem?.name;
  const newInputValue = sname ? sname : state.inputValue;
  return {
    ...changes,
    selectedItem: state.selectedItem,
    inputValue: newInputValue,
  };
}

export function stateReducer(state, actionAndChanges) {
  const { type, changes } = actionAndChanges;
  switch (type) {
    case useCombobox.stateChangeTypes.InputKeyDownEscape:
      return resetToPreviousVal(state, changes);
    case useCombobox.stateChangeTypes.InputBlur:
      if (state.highlightedIndex !== -1) {
        return changes;
      }
      return resetToPreviousVal(state, changes);
    default:
      return changes; // otherwise business as usual.
  }
}
