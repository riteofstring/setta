import { CUIAutoComplete } from "chakra-ui-autocomplete";
import { Section } from "../../../../../../../../../utils/jsonParser";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useEffect } from "react";
import {
  requiresNestedSection,
  combineModules,
} from "../../../../../../../../../utils/utils";

function valueAndLabel(x) {
  return { value: x, label: x };
}

export function NestedObjectInputConfig({
  availableModules,
  onChange,
  savedConfig,
}) {
  const getSelectedItems = () => {
    if (savedConfig?.modules) {
      return savedConfig.modules.map((x) => valueAndLabel(x));
    }
    return [];
  };

  const items = Object.keys(availableModules).map((x) => valueAndLabel(x));

  const handleSelectedItemsChange = (selectedItems) => {
    if (selectedItems) {
      onChange(
        "modules",
        selectedItems.map((x) => x.value)
      );
    }
  };

  return (
    <CUIAutoComplete
      placeholder="Module name"
      selectedItems={getSelectedItems()}
      items={items}
      onSelectedItemsChange={(changes) =>
        handleSelectedItemsChange(changes.selectedItems)
      }
    />
  );
}

// export function NestedObjectInputParseConfig(config) {
//   if (config) {
//     return ["torchvision_models", "my_models"];
//     // const stringified = JSON.stringify(config);
//     // console.log("stringified", stringified);
//     // const output = JSON.parse(config["modules"]);
//     // console.log("typeof", typeof output);
//     // console.log("output[modules]", output["modules"])
//     // if ("modules" in output && Array.isArray(output["modules"])) {
//     //   return output["modules"];
//     // }
//   }
//   return null;
// }

export default function NestedObjectInput({
  sectionId,
  moduleName,
  objName,
  paramName,
  uiType,
  uiTypeConfig,
}) {
  const availableModules = useStoreState(
    (state) => state.master.availableModules
  );

  const setSectionParamType = useStoreActions(
    (actions) => actions.master.setSectionParamType
  );

  const setNestedSectionIds = useStoreActions(
    (actions) => actions.nestedSectionIds.setNestedSectionIds
  );

  const permanentlyDeleteSection = useStoreActions(
    (actions) => actions.master.permanentlyDeleteSection
  );

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );
  const nestedSectionId = useStoreState(
    (state) =>
      state.nestedSectionIds.nestedSectionIds[sectionId]?.[moduleName]?.[
        objName
      ]?.[paramName]
  );

  const wrapperSetNestedSectionId = (newNestedSectionId) => {
    setNestedSectionIds({
      sectionId,
      moduleName,
      objName,
      paramName,
      nestedSectionId: newNestedSectionId,
    });
  };

  const wrapperSetSectionParamType = (newType) => {
    setSectionParamType({
      sectionId,
      moduleName,
      objName,
      paramName,
      newType,
    });
  };

  useEffect(() => {
    if (uiType && uiTypeConfig?.modules) {
      let newNestedSectionId = null;
      if (nestedSectionId) {
        permanentlyDeleteSection({
          sectionId: nestedSectionId,
          parentId: sectionId,
        });
      }
      if (requiresNestedSection(uiType)) {
        wrapperSetSectionParamType(
          new Section(paramName, combineModules(availableModules, uiTypeConfig.modules))
        );
        newNestedSectionId = addToVisibleSectionIdsThunk({
          name: paramName,
          parentId: sectionId,
          moduleName,
          objName,
          isList: uiType === "LIST_NESTED_OBJECT",
          siblingId: null,
        });
      }
      if (newNestedSectionId || nestedSectionId) {
        // set if a new section was added
        // or if it used to be nested section and should be deleted
        wrapperSetNestedSectionId(newNestedSectionId);
      }
    }
  }, [uiType, uiTypeConfig]);

  return null;
}
