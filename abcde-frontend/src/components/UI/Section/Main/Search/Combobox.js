import React from "react";
import { InputLeftElement, Input, List, ListItem } from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";

export const ComboboxInput = React.forwardRef(({ ...props }, ref) => {
  return (
    <>
      <InputLeftElement
        pointerEvents="none"
        children={<SearchIcon color="gray.300" />}
      />
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
