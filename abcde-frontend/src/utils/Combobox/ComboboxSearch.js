import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import { matchSorter } from "match-sorter";
import React from "react";

import {
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  stateReducer,
} from "./Combobox";

export function ComboboxSearch({
  items,
  inputItems,
  selectedItem,
  itemToString,
  setInputItems,
  onClick,
  onSelectedItemChange,
}) {
  const {
    isOpen,
    getToggleButtonProps,
    // getLabelProps,
    getMenuProps,
    getInputProps,
    getComboboxProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    stateReducer,
    selectedItem,
    items: inputItems,
    itemToString,
    onSelectedItemChange,
    onInputValueChange: ({ inputValue }) => {
      setInputItems(matchSorter(items, inputValue, { keys: ["name"] }));
    },
  });

  return (
    <>
      <Flex direction="column" align="center" overflow="visible" h="2.5rem">
        {/* <Text as="label" fontSize="lg" {...getLabelProps()}>
        label
      </Text> */}

        <InputGroup width="100%">
          <ComboboxInput
            {...getInputProps()}
            bg="white"
            placeholder="Search..."
            onClick={onClick}
          />
          <IconButton
            {...getToggleButtonProps({ onClick: onClick })}
            aria-label={"toggle menu"}
            variantcolor={isOpen ? "gray" : "teal"}
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
            boxShadow="xl"
            border="1px"
            borderColor="gray.300"
            w="inherit"
          >
            {inputItems.map((item, index) => (
              <ComboboxItem
                {...getItemProps({ item, index })}
                itemIndex={index}
                highlightedIndex={highlightedIndex}
                key={index}
                className="SectionSearch"
              >
                {itemToString(item)}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </Flex>
      </Flex>
    </>
  );
}
