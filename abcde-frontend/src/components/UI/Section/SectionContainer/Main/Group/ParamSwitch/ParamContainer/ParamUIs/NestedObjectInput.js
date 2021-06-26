import { CUIAutoComplete } from "chakra-ui-autocomplete";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useEffect, useState, useContext } from "react";
import { flattenDictOfArrays } from "../../../../../../../../../utils/utils";
import { includesArray } from "../../../../../../../../../utils/commonFunctions";
import { ChildrenContext } from "../../../../../SectionContainer";

function valueAndLabel(x, type) {
  return { value: [x, type], label: x };
}

function findMatchingIndex(initialPickerItems, savedConfig, j) {
  return initialPickerItems
    .map((e, idx) =>
      e.value[1] === j && savedConfig[j].includes(e.value[0]) ? idx : -1
    )
    .filter((e) => e !== -1)
    .map((e) => initialPickerItems[e]);
}

function onChangeWrapper(onChange, initialPickerItemsObj, newSelectedItems, j) {
  const valuesOnly = initialPickerItemsObj[j].map((x) => x.value);
  onChange(
    j,
    newSelectedItems
      .filter((x) => includesArray(valuesOnly, x.value))
      .map((x) => x.value[0])
  );
}

export function NestedObjectInputConfig({
  name,
  availableObjects,
  availableParameters,
  onChange,
  savedConfig,
}) {
  const pickerObjects = availableObjects.map((x) =>
    valueAndLabel(x, "objects")
  );
  const pickerParameters = availableParameters.map((x) =>
    valueAndLabel(x, "parameters")
  );
  const initialPickerItems = pickerObjects.concat(pickerParameters);
  const initialPickerItemsObj = {
    objects: pickerObjects,
    parameters: pickerParameters,
  };

  const getInitialSelectedItem = () => {
    if (savedConfig) {
      let output = {};
      for (let j of Object.keys(savedConfig)) {
        output[j] = findMatchingIndex(initialPickerItems, savedConfig, j);
      }
      return flattenDictOfArrays(output);
    }
    return [];
  };

  const [pickerItems, setPickerItems] = useState(initialPickerItems);
  const [selectedItems, setSelectedItems] = useState(getInitialSelectedItem());

  const handleCreateItem = (item) => {
    setPickerItems((curr) => [...curr, item]);
    setSelectedItems((curr) => [...curr, item]);
  };

  const handleSelectedItemsChange = (newSelectedItems) => {
    if (newSelectedItems) {
      setSelectedItems(newSelectedItems);
      for (let j of Object.keys(initialPickerItemsObj)) {
        onChangeWrapper(onChange, initialPickerItemsObj, newSelectedItems, j);
      }
    }
  };

  useEffect(() => {
    setSelectedItems(getInitialSelectedItem());
  }, [name]);

  return (
    <CUIAutoComplete
      placeholder="Module name"
      onCreateItem={handleCreateItem}
      items={pickerItems}
      selectedItems={selectedItems}
      onSelectedItemsChange={(changes) =>
        handleSelectedItemsChange(changes.selectedItems)
      }
    />
  );
}

export default function NestedObjectInput({
  sectionId,
  paramName,
  uiType,
  paramUITypeConfig,
}) {
  const { children, addChild } = useContext(ChildrenContext);

  useEffect(() => {
    addChild(uiType.config);
  }, []);

  // const addChildren = useStoreActions((actions) => actions.master.addChildren);
  // const childId = useStoreState(
  //   (state) =>
  //     state.master.sections.getChildrenIdsPerParam(sectionId, paramName)?.[0]
  // );
  // const setSectionModules = useStoreActions(
  //   (actions) => actions.master.setSectionModules
  // );
  // const setChildrenIdsPerParam = useStoreActions(
  //   (actions) => actions.master.setChildrenIdsPerParam
  // );

  // useEffect(() => {
  //   if (!childId) {
  //     const newIds = addChildren({
  //       parentId: sectionId,
  //       paramName,
  //       uiType,
  //     });
  //     setChildrenIdsPerParam({
  //       sectionId,
  //       paramName,
  //       childrenIds: newIds,
  //     });
  //   }
  // }, [childId]);

  // useEffect(() => {
  //   if (childId) {
  //     setSectionModules({
  //       sectionId: childId,
  //       parentId: sectionId,
  //       paramName: paramName,
  //       specs: paramUITypeConfig,
  //     });
  //   }
  // }, [paramUITypeConfig]);

  return null;
}
