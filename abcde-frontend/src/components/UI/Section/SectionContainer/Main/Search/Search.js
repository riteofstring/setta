import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import React, { useState } from "react";

import { useGetObjInfos } from "../../../../../../utils/useCreateInfo";
import { ComboboxInput, ComboboxList, ComboboxItem } from "./Combobox";

export default function SectionSearch({
  moduleInfos,
  moduleInfoIds,
  onSelectedItemChange,
  initialSelection,
}) {
  const [selection, setSelection] = useState("");
  const [items, setItems] = useState([]);
  const [inputItems, setInputItems] = useState([]);
  const [objInfos, objInfoIds] = useGetObjInfos(moduleInfoIds);

  const itemToString = (x) => {
    return x ? objInfos[x[0]][x[1]].name : "";
  };

  const getSearchItems = () => {
    let output = [];
    for (let i = 0; i < moduleInfos.length; i++) {
      for (let j = 0; j < objInfoIds[i].length; j++) {
        output.push([i, j]);
      }
    }
    return output;
  };

  const onClick = () => {
    setItems(getSearchItems());
    setInputItems(getSearchItems());
  };

  const localOnSelectedItemChange = ({ selectedItem }) => {
    console.log("localOnSelectedItemChange", selectedItem);
    if (selectedItem) {
      const [moduleName, objName] = selectedItem;
      if (moduleName !== selection[0] || objName !== selection[1]) {
        setSelection([moduleName, objName]);
      }
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
