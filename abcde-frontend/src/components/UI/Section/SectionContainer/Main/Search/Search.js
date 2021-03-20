import React, { useState, useEffect } from "react";
import { useCombobox } from "downshift";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { ComboboxInput, ComboboxList, ComboboxItem } from "./Combobox";
import { useStoreState, useStoreActions } from "easy-peasy";

export default function SectionSearch({ sectionId, items }) {
  const [selectedItem, setSelectedItem] = useState("");

  const itemToString = (x) => {
    return x ? x[1] : "";
  };
  const selected = useStoreState((state) => state.master.selected[sectionId]);
  const sectionHasNested = useStoreState(
    (state) => state.master.sectionHasNested[sectionId]
  );
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteChildrenFromVisibleSectionIds = useStoreActions(
    (actions) => actions.master.deleteChildrenFromVisibleSectionIds
  );

  useEffect(() => {
    const info = selected ? selected : "";
    if (info === "") {
      setSelectedItem(info);
    }
    const { moduleName, name } = info;
    const index = items.findIndex((x) => x[0] === moduleName && x[1] === name);
    if (index !== -1){
      setSelectedItem(items[index]);
    }
  }, [selected, items]);

  const onSelectedItemChange = ({ selectedItem }) => {
    const [moduleName, objName] = selectedItem;
    if (sectionHasNested) {
      deleteChildrenFromVisibleSectionIds({
        sectionId,
      });
    }
    setSelected({ sectionId, moduleName, name: objName });
  };

  const [inputItems, setInputItems] = useState(items);
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
    selectedItem,
    items: inputItems,
    itemToString,
    onSelectedItemChange,
    onInputValueChange: ({ inputValue }) => {
      setInputItems(
        items.filter((item) =>
          itemToString(item).toLowerCase().startsWith(inputValue.toLowerCase())
        )
      );
    },
  });

  console.log("selectedItem", selectedItem);
  console.log("highlightedIndex", highlightedIndex);

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
            />
            <IconButton
              {...getToggleButtonProps()}
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
