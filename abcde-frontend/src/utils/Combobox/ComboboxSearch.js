import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import React, { useEffect, useState } from "react";

import {
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  stateReducer,
} from "./Combobox";

export function ComboboxSearch({
  allItems,
  initialSelection,
  itemToString,
  onSelectedItemChange,
  matchSorterProps,
}) {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    if (initialSelection && !_.isEqual(selection, initialSelection)) {
      setSelection(initialSelection);
    }
  }, [initialSelection]);

  const onClick = () => {
    if (!_.isEqual(allItems, items)) {
      setItems(allItems);
      setFilteredItems(allItems);
    }
  };

  const localOnSelectedItemChange = ({ selectedItem }) => {
    onSelectedItemChange(selection, selectedItem, setSelection);
  };

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
    selectedItem: selection,
    items: filteredItems,
    itemToString,
    onSelectedItemChange: localOnSelectedItemChange,
    onInputValueChange: ({ inputValue }) => {
      setFilteredItems(matchSorter(items, inputValue, matchSorterProps));
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
            {filteredItems.map((item, index) => (
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
