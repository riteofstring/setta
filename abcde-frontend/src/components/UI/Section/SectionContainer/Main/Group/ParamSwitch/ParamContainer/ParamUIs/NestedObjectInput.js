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
  const savedSelectedItems = savedConfig?.modules
    ? savedConfig.modules.map((x) => valueAndLabel(x))
    : [];

  const items = Object.keys(availableModules).map((x) => valueAndLabel(x));

  const [selectedItems, setSelectedItems] = useState(savedSelectedItems);

  useEffect(() => {
    setSelectedItems(savedSelectedItems);
  }, [name]);

  const handleSelectedItemsChange = (newSelectedItems) => {
    if (newSelectedItems) {
      setSelectedItems(newSelectedItems);
      onChange(
        "modules",
        newSelectedItems.map((x) => x.value)
      );
    }
  };

  return (
    <CUIAutoComplete
      placeholder="Module name"
      selectedItems={selectedItems}
      items={items}
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
  const hasBeenVisited = useStoreState((state) =>
    state.master.sections.getHasBeenVisited(sectionId, paramName)
  );
  const nestedSectionId = useStoreState((state) =>
    state.master.sections.getNestedSectionIds(sectionId, paramName, true)
  );
  const setHasBeenVisited = useStoreActions(
    (actions) => actions.master.setHasBeenVisited
  );

  const setUIType = useStoreActions((actions) => actions.master.setUIType);
  const setSectionModules = useStoreActions(
    (actions) => actions.master.setSectionModules
  );
  const deleteChildren = useStoreActions(
    (actions) => actions.master.deleteChildren
  );
  console.log("paramUITypeConfig", uiType, paramUITypeConfig);

  useEffect(() => {
    if (!hasBeenVisited) {
      const newIds = addChildren({
        parentId: sectionId,
        paramName,
        uiType,
      });
      setHasBeenVisited({
        sectionId,
        paramName,
        hasBeenVisited: true,
      });
    }
  }, []);

  useEffect(() => {
    if (nestedSectionId) {
      // if any old children exist, they have to be deleted
      deleteChildren({
        parentId: nestedSectionId,
        sourceId: nestedSectionId,
        numChildren: "all",
      });
      setUIType({ sectionId: nestedSectionId, uiType });
    }
  }, [uiType]);

  useEffect(() => {
    let modules = paramUITypeConfig["modules"];
    if (nullOrUndefined(modules)) {
      modules = [];
    }
    if (nestedSectionId) {
      setSectionModules({
        sectionId: nestedSectionId,
        specs: modules,
      });
    }
  }, [paramUITypeConfig]);

  return null;
}

export function NestedObjectCleanup({ sectionId, paramName, uiType }) {
  const setHasBeenVisited = useStoreActions(
    (actions) => actions.master.setHasBeenVisited
  );
  const nestedSectionId = useStoreState((state) =>
    state.master.sections.getNestedSectionIds(sectionId, paramName, true)
  );
  const deleteSections = useStoreActions(
    (actions) => actions.master.deleteSections
  );

  const deleteChildren = useStoreActions(
    (actions) => actions.master.deleteChildren
  );

  useEffect(() => {
    if (nestedSectionId) {
      console.log("deleting section", sectionId);
      deleteChildren({
        parentId: nestedSectionId,
        sourceId: nestedSectionId,
        numChildren: "all",
      });
      deleteSections({
        sectionIds: [nestedSectionId],
        parentId: sectionId,
        paramName,
      });
      setHasBeenVisited({
        sectionId,
        paramName,
        hasBeenVisited: false,
      });
    }
  }, []);

  return null;
}
