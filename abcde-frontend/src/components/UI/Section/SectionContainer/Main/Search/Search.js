import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import _ from "lodash";
import React, { useState } from "react";

import { useGetObjInfos } from "../../../../../../utils/useCreateInfo";
import { ComboboxInput, ComboboxList, ComboboxItem } from "./Combobox";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const objInfos = useGetObjInfos(sectionId);
  const [selection, setSelection] = useState("");
  const [items, setItems] = useState([]);
  const [inputItems, setInputItems] = useState([]);

  const itemToString = (x) => {
    return x ? x.name : "";
  };

  const getSearchItems = () => {
    return objInfos;
  };

  const onClick = () => {
    setItems(getSearchItems());
    setInputItems(getSearchItems());
  };

  const localOnSelectedItemChange = ({ selectedItem }) => {
    console.log("localOnSelectedItemChange", selectedItem);
    if (!_.isEqual(selectedItem, selection)) {
      setSelection(selectedItem);
    }
    onSelectedItemChange(selectedItem);
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
    selection,
    items: inputItems,
    itemToString,
    onSelectedItemChange: localOnSelectedItemChange,
    onInputValueChange: ({ inputValue }) => {
      setInputItems(
        items.filter((item) =>
          itemToString(item).toLowerCase().startsWith(inputValue.toLowerCase())
        )
      );
    },
  });

  // temp_
  const tempBool = true;
  return (
    <>
      {tempBool && (
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
      )}
    </>
  );
}
