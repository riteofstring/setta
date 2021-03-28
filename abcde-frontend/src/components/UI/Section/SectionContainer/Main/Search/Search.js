import React, { useState, useEffect } from "react";
import { useCombobox } from "downshift";
import { InputGroup, Flex, IconButton } from "@chakra-ui/react";
import { ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { ComboboxInput, ComboboxList, ComboboxItem } from "./Combobox";
import { useStoreState, useStoreActions } from "easy-peasy";

export default function SectionSearch({ sectionId }) {
  const [selectedItem, setSelectedItem] = useState("");
  const [items, setItems] = useState([]);
  const [inputItems, setInputItems] = useState([]);

  const itemToString = (x) => {
    return x ? x[1] : "";
  };

  const theSection = useStoreState((state) => state.master.sections[sectionId]);
  const currPage = useStoreState((state) => state.master.currPage);
  const {
    moduleName: selectedModuleName,
    objName: selectedObjName,
  } = useStoreState((state) => state.master.idHierarchy[currPage][sectionId]);
  const sectionHasNested = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].hasNested
  );
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteChildrenFromVisibleSectionIds = useStoreActions(
    (actions) => actions.master.deleteChildrenFromVisibleSectionIds
  );

  const getSearchItems = () => {
    const { moduleInfos } = theSection;
    let output = [];
    for (let moduleName of Object.keys(moduleInfos)) {
      for (let objName of Object.keys(moduleInfos[moduleName].objs)) {
        output.push([moduleName, objName]);
      }
    }
    return output;
  };

  const onClick = () => {
    if (items.length === 0) {
      setItems(getSearchItems());
      setInputItems(getSearchItems());
    }
  };

  useEffect(() => {
    if (selectedModuleName && selectedObjName) {
      setSelectedItem([selectedModuleName, selectedObjName]);
    }
  }, [selectedModuleName, selectedObjName]);

  const onSelectedItemChange = ({ selectedItem }) => {
    const [moduleName, objName] = selectedItem;
    if (moduleName !== selectedModuleName || objName !== selectedObjName) {
      if (sectionHasNested) {
        deleteChildrenFromVisibleSectionIds({
          sectionId,
        });
      }
      setSelected({ sectionId, moduleName, objName });
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
