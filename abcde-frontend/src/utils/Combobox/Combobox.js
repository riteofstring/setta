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
      simpleSearch = false,
      size = "normal",
      ...props
    },
    ref
  ) => {
    return (
      <InputGroup
        width="100%"
        className="nodrag"
        size={size === "small" ? "sm" : "md"}
      >
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        {!simpleSearch ? (
          <FancySearch
            height={height}
            size={size}
            textSize={textSize}
            isOpen={isOpen}
            {...props}
            {...toggleButtonProps}
          />
        ) : (
          <SimpleSearch
            height={height}
            size={size}
            textSize={textSize}
            {...props}
            {...toggleButtonProps}
          />
        )}
        {dropdown && (
          <InputRightElement>
            <IconButton
              {...toggleButtonProps}
              aria-label={"toggle menu"}
              borderRadius={!simpleSearch ? "full" : "2xl"}
              bg={!simpleSearch ? "white" : "unset"}
              icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              // height={height - 10}
              size={size === "small" ? "xs" : "md"}
            />
          </InputRightElement>
        )}
      </InputGroup>
    );
  }
);

const FancySearch = ({
  toggleButtonProps,
  ref,
  textSize,
  height,
  size,
  isOpen,
  ...props
}) => {
  return (
    <Input
      w="100%"
      pl="2.5rem"
      h={(size === "small" && "32px") || height}
      {...props}
      {...toggleButtonProps}
      ref={ref}
      placeholder="Search"
      border={0}
      borderRadius="1.2rem"
      borderBottomRadius={isOpen && "none"}
      boxShadow="sm"
      size={textSize}
    />
  );
};

const SimpleSearch = ({
  toggleButtonProps,
  ref,
  textSize,
  height,
  size,
  ...props
}) => {
  return (
    <Input
      h={(size === "small" && "32px") || height}
      {...props}
      {...toggleButtonProps}
      size={textSize}
      variant="flushed"
      placeholder="Search"
      pl="2.5rem"
      bg="unset"
    />
  );
};

export const ComboboxList = React.forwardRef(({ isOpen, ...props }, ref) => {
  return (
    <List
      display={isOpen ? null : "none"}
      {...props}
      ref={ref}
      position="absolute"
      className="nowheel nodrag"
      zIndex="100"
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
