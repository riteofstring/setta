import "@chakra-ui/icons";
import { Box, Flex } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useEffect, useState } from "react";

import {
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
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
  width,
  size,
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
      <Flex
        direction="column"
        align="stretch"
        overflow="visible"
        h="2.5rem"
        w="100%"
      >
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
          size={size}
        />

        <Flex
          {...getComboboxProps()}
          direction="column"
          // flex="1 1 auto"
          zIndex="10000"
          // w="calc(100%)"
          w={width}
          alignItems="stretch"
          transitionDuration="0.25s"
        >
          <ComboboxList
            isOpen={isOpen}
            {...getMenuProps()}
            flex={1}
            maxH="16rem"
            mt={0}
            bg="white"
            borderBottomLeftRadius="3xl"
            borderBottomRightRadius="3xl"
            boxShadow="xl"
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
