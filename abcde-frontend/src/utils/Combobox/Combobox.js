import { SearchIcon, ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import {
  InputLeftElement,
  InputRightElement,
  InputGroup,
  IconButton,
  Input,
  List,
  ListItem,
} from "@chakra-ui/react";
import { useCombobox } from "downshift";
import React from "react";

export const ComboboxInput = React.forwardRef(
  (
    {
      toggleButtonProps,
      dropdown,
      isOpen,
      textSize,
      height = "40px",
      ...props
    },
    ref
  ) => {
    return (
      <InputGroup width="100%">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        <Input
          w="100%"
          pl="2.5rem"
          h={height}
          {...props}
          {...toggleButtonProps}
          ref={ref}
          placeholder="Search"
          border={0}
          borderRadius="full"
          boxShadow="sm"
          size={textSize}
        />
        {dropdown && (
          <InputRightElement>
            <IconButton
              {...toggleButtonProps}
              aria-label={"toggle menu"}
              borderRadius="full"
              bg="white"
              icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
            />
          </InputRightElement>
        )}
      </InputGroup>
    );
  }
);

export const ComboboxList = React.forwardRef(({ isOpen, ...props }, ref) => {
  return (
    <List
      display={isOpen ? null : "none"}
      {...props}
      ref={ref}
      position="absolute"
    />
  );
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
        borderRadius="2xl"
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
