import "@chakra-ui/icons";
import { Flex, Box } from "@chakra-ui/react";
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
  textSize,
  simpleSearch,
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
        <ComboboxInput
          {...getInputProps()}
          toggleButtonProps={getToggleButtonProps({ onClick: onClick })}
          bg="white"
          placeholder="Search..."
          onClick={onClick}
          isOpen={isOpen}
          dropdown={true}
          textSize={textSize}
          simpleSearch={simpleSearch}
        />

        {/* TODO: FIX WIDTH & ZINDEX */}
        <Flex
          {...getComboboxProps()}
          direction="column"
          flex="1 1 auto"
          width="400px"
          zIndex="10000"
          position="absolute"
          mt="2.5rem"
        >
          <ComboboxList
            isOpen={isOpen}
            {...getMenuProps()}
            flex={1}
            maxH="16rem"
            mt={2}
            bg="white"
            borderRadius="3xl"
            boxShadow="xl"
            border="1px"
            borderColor="gray.300"
            w="inherit"
            // p=".5rem"
            display={isOpen ? "flex" : "none"}
            alignItems="stretch"
          >
            <Box m={3} maxH="100%" overflowY="scroll" width="100%">
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
            </Box>
          </ComboboxList>
        </Flex>
      </Flex>
    </>
  );
}
