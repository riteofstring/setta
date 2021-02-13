import React, { useState } from "react";
import { useCombobox } from "downshift";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { ComboboxInput, ComboboxList, ComboboxItem } from "./Combobox";

const items = ["Seattle", "San Francisco", "Springfield", "New York", "Boston"];

export default function SectionSearch() {
  const [inputItems, setInputItems] = useState(items);
  const {
    isOpen,
    // selectedItem,
    getToggleButtonProps,
    // getLabelProps,
    getMenuProps,
    getInputProps,
    getComboboxProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    items: inputItems,
    onInputValueChange: ({ inputValue }) => {
      setInputItems(
        items.filter((item) =>
          item.toLowerCase().startsWith(inputValue.toLowerCase())
        )
      );
    },
  });
  return (
    <Flex direction="column" align="center" overflow="visible" h="2.5rem">
      {/* <Text as="label" fontSize="lg" {...getLabelProps()}>
        label
      </Text> */}

      <InputGroup width="100%">
        <ComboboxInput
          {...getInputProps()}
          bg="white"
          placeholder="Search..."
        />
        <IconButton
          {...getToggleButtonProps()}
          aria-label={"toggle menu"}
          variantColor={isOpen ? "gray" : "teal"}
          icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        />
      </InputGroup>

      <Flex
        {...getComboboxProps()}
        direction="column"
        flex="1 1 auto"
        width="100%"
        zIndex="10"
      >
        <ComboboxList
          isOpen={isOpen}
          {...getMenuProps()}
          flex={1}
          maxH="16rem"
          overflowY="scroll"
          mt={2}
          bg="white"
          borderRadius="0.25rem"
        >
          {inputItems.map((item, index) => (
            <ComboboxItem
              {...getItemProps({ item, index })}
              itemIndex={index}
              highlightedIndex={highlightedIndex}
              key={index}
            >
              {item}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </Flex>
    </Flex>
  );
}
