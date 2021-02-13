import React, { useState } from "react";
import { useCombobox } from "downshift";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { ComboboxInput, ComboboxList, ComboboxItem } from "./Combobox";
import { useStoreState, useStoreActions } from "easy-peasy";

export default function SectionSearch({ theSection }) {
  const { moduleInfos } = theSection;

  const getItems = () => {
    let output = [];
    for (let moduleName of Object.keys(moduleInfos)) {
      for (let objName of Object.keys(moduleInfos[moduleName].objs)) {
        output.push(objName);
      }
    }
    return output;
  };

  const items = getItems();

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
