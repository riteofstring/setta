import { CUIAutoComplete } from "chakra-ui-autocomplete";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useEffect, useState } from "react";
import { nullOrUndefined } from "../../../../../../../../../utils/utils";

function valueAndLabel(x) {
  return { value: x, label: x };
}

export function NestedObjectInputConfig({
  name,
  availableModules,
  onChange,
  savedConfig,
}) {
  const initialPickerItems = availableModules.map((x) => valueAndLabel(x));

  const getInitialSelectedItem = () => {
    if (savedConfig?.modules) {
      const modules = savedConfig.modules;
      return initialPickerItems
        .map((e, idx) => (modules.includes(e.value) ? idx : -1))
        .filter((e) => e !== -1)
        .map((e) => initialPickerItems[e]);
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
      onChange(
        "modules",
        newSelectedItems.map((x) => x.value)
      );
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
  const addChildren = useStoreActions((actions) => actions.master.addChildren);
  const childId = useStoreState((state) =>
    state.master.sections.getChildrenIdsPerParam(sectionId, paramName)?.[0]
  );
  const setUIType = useStoreActions((actions) => actions.master.setUIType);
  const setSectionModules = useStoreActions(
    (actions) => actions.master.setSectionModules
  );
  const setChildrenIdsPerParam = useStoreActions(
    (actions) => actions.master.setChildrenIdsPerParam
  );

  useEffect(() => {
    if (!childId) {
      const newIds = addChildren({
        parentId: sectionId,
        paramName,
        uiType,
      });
      setChildrenIdsPerParam({
        sectionId,
        paramName,
        childrenIds: newIds,
      });
    }
  }, [childId]);

  useEffect(() => {
    let modules = paramUITypeConfig["modules"];
    if (nullOrUndefined(modules)) {
      modules = [];
    }
    if (childId) {
      setSectionModules({
        sectionId: childId,
        specs: modules,
      });
    }
  }, [paramUITypeConfig]);

  return null;
}
