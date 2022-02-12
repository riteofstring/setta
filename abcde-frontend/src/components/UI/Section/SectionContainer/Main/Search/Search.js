import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { useCombobox } from "downshift";
import { useGetObjInfos } from "hooks/useSectionContents";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import React, { useState } from "react";

import {
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  stateReducer,
} from "./Combobox";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const objInfos = useGetObjInfos(sectionId);
  //to avoid uncontrolled --> controlled warning
  const init = _.find(objInfos, { id: initialSelection });
  const [selection, setSelection] = useState(init ? init : "");
  const [items, setItems] = useState([]);
  const [inputItems, setInputItems] = useState([]);

  const itemToString = (x) => {
    return x ? x.name : "";
  };

  const onClick = () => {
    setItems(objInfos);
    setInputItems(objInfos);
  };

  const localOnSelectedItemChange = ({ selectedItem }) => {
    if (selectedItem) {
      const sid = selectedItem.id;
      if (sid !== selection?.id) {
        setSelection(selectedItem);
      }
      onSelectedItemChange(sid);
    }
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
    items: inputItems,
    itemToString,
    onSelectedItemChange: localOnSelectedItemChange,
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
