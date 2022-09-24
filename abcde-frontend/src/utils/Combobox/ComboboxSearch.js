import "@chakra-ui/icons";
import { Box, Flex } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import _ from "lodash";
import { useEffect, useState } from "react";
import { ComboboxInput, ComboboxItem, ComboboxList } from "./Combobox";
import { useComboboxStateReducer } from "./ComboboxStateReducer";

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
  const [selection, setSelection] = useState(null);
  const { filteredItems, stateReducer } = useComboboxStateReducer({
    allItems,
    matchSorterProps,
  });

  useEffect(() => {
    if (initialSelection && !_.isEqual(selection, initialSelection)) {
      setSelection(initialSelection);
    }
  }, [initialSelection]);

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
  });

  return (
    <>
      <Flex
        direction="column"
        align="stretch"
        overflow="visible"
        h="2.5rem"
        w="100%"
        {...getComboboxProps()}
      >
        {/* <Text as="label" fontSize="lg" {...getLabelProps()}>
        label
      </Text> */}
        <ComboboxInput
          {...getInputProps()}
          toggleButtonProps={getToggleButtonProps()}
          bg="white"
          placeholder="Search..."
          isOpen={isOpen}
          dropdown={true}
          textSize={textSize}
          simpleSearch={simpleSearch}
          size={size}
        />

        <Flex
          direction="column"
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
            zIndex="20"
          >
            <Box m={3} maxH="100%" overflowY="scroll" width="100%">
              {filteredItems.map((item, index) => (
                <ComboboxItem
                  {...getItemProps({ item, index })}
                  itemIndex={index}
                  highlightedIndex={highlightedIndex}
                  key={index}
                  itemType={allItems[index]}
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
