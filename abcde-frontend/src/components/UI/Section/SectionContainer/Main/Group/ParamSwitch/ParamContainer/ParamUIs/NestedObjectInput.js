import { CUIAutoComplete } from "chakra-ui-autocomplete";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useEffect, useState } from "react";

import {
  useGetSectionInfo,
  useAddChild,
} from "../../../../../../../../../hooks/useCreateInfo";
import { includesArray } from "../../../../../../../../../utils/commonFunctions";
import { flattenDictOfArrays } from "../../../../../../../../../utils/utils";

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

export function NestedObjectInputConfig({ name, onChange, savedConfig }) {
  const availableObjects = useStoreState((x) =>
    Object.keys(x.master.allObjCollections.nameToId)
  );
  const availableParameters = useStoreState((x) =>
    Object.keys(x.master.allParamCollections.nameToId)
  );

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
  uiTypeConfig,
  parentParamInfoId,
  childIdFn,
}) {
  console.log("NestedObjectInput", uiType, uiTypeConfig);
  const existingChildId = childIdFn(parentParamInfoId)[0];
  const addChild = useAddChild(sectionId);
  const childSectionTypeId = useGetSectionInfo(existingChildId).sectionTypeId;
  const reinitSectionType = useStoreActions(
    (x) => x.sectionTypes.reinitSectionType
  );

  useEffect(() => {
    if (!existingChildId) {
      addChild({
        name: paramName,
        uiType,
        uiTypeConfig,
        parentParamInfoId,
      });
    } else {
      reinitSectionType({
        sectionTypeId: childSectionTypeId,
        uiType,
        uiTypeConfig,
      });
    }
  }, [uiType, uiTypeConfig]);

  return null;
}
