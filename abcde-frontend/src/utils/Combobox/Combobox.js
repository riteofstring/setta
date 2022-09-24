import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from "@chakra-ui/icons";
import {
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  List,
  ListItem,
} from "@chakra-ui/react";
import { useCombobox } from "downshift";
import React, { useEffect, useState } from "react";

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
        // width="100%"
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
            // isOpen={isOpen}
            {...props}
            {...toggleButtonProps}
            ref={ref}
          />
        ) : (
          <SimpleSearch
            height={height}
            size={size}
            textSize={textSize}
            {...props}
            {...toggleButtonProps}
            ref={ref}
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

const FancySearch = React.forwardRef(
  ({ toggleButtonProps, textSize, height, size, ...props }, ref) => {
    return (
      <Input
        // w="100%"
        pl="2.5rem"
        h={(size === "small" && "32px") || height}
        {...props}
        {...toggleButtonProps}
        placeholder="Search"
        border={0}
        borderRadius="full"
        // borderRadius="1.2rem"
        // borderBottomRadius={isOpen && "none"}
        boxShadow="sm"
        size={textSize}
        ref={ref}
      />
    );
  }
);

const SimpleSearch = React.forwardRef(
  ({ toggleButtonProps, textSize, height, size, ...props }, ref) => {
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
        ref={ref}
      />
    );
  }
);

export const ComboboxList = React.forwardRef(({ isOpen, ...props }, ref) => {
  return (
    <List
      display={isOpen ? null : "none"}
      {...props}
      ref={ref}
      position="fixed"
      overflow="visible !important"
      className="nowheel nodrag"
      borderRadius="3xl"
      mt="0.5rem"
    />
  );
});

export const ComboboxItem = React.forwardRef(
  ({ itemIndex, highlightedIndex, itemType, ...props }, ref) => {
    const isActive = itemIndex === highlightedIndex;
    const [listItemType, setListItemType] = useState({});

    useEffect(() => {
      if (itemType.presetType === "user") {
        setListItemType({
          weight: "700",
          fontStyle: "italic",
          color: "green.700",
        });
      }
      if (itemType.presetType === "base") {
        setListItemType({ weight: "700", color: "blue.500" });
      }
      if (itemType.presetType === null) {
        setListItemType("grey.500");
      }
    }, []);

    return (
      <ListItem
        transition="background-color 220ms, color 220ms"
        bg={isActive ? "gray.100" : null}
        color={listItemType.color}
        weight={listItemType.weight}
        px={4}
        py={2}
        cursor="pointer"
        {...props}
        ref={ref}
        borderRadius="xl"
        mx="0.25rem"
        my="0.125rem"
        fontStyle={listItemType.fontStyle}
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
