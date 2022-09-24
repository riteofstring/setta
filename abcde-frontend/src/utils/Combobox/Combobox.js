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
        <SearchInput
          simpleSearch={simpleSearch}
          height={height}
          size={size}
          textSize={textSize}
          isOpen={isOpen}
          {...props}
          {...toggleButtonProps}
          ref={ref}
        />
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

const SearchInput = React.forwardRef(
  ({ textSize, height, size, simpleSearch, isOpen, ...props }, ref) => {
    function onClick(e) {
      if (!isOpen) {
        props.onClick(e);
      }
    }

    const commonProps = {
      ...props,
      onClick: onClick,
      placeholder: "Search",
      h: (size === "small" && "32px") || height,
      pl: "2.5rem",
      size: textSize,
    };

    const specificProps = simpleSearch
      ? {
          variant: "flushed",
          bg: "unset",
        }
      : {
          border: 0,
          borderRadius: "full",
          boxShadow: "sm",
        };

    return <Input {...commonProps} {...specificProps} ref={ref} />;
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
        data-testid={"ComboboxListItem"}
        fontStyle={listItemType.fontStyle}
      />
    );
  }
);
