import { CUIAutoComplete } from "chakra-ui-autocomplete";
import { Section } from "../../../../../../../../../utils/jsonParser";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useEffect } from "react";
import {
  requiresNestedSection,
  combineModules,
  parameterStateDetailsGetter,
  sectionParameterGetter,
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

export default function NestedObjectInput({
  sectionId,
  moduleName,
  objName,
  paramName,
  uiType: inputUiType,
  uiTypeConfig,
}) {
  const nestedSectionInfo = useStoreState(
    (state) =>
      sectionParameterGetter(
        state.master.sections,
        sectionId,
        moduleName,
        objName,
        paramName
      ).type,
    //only care about x -> Section or Section -> x
    (prev, next) =>
      (!(prev instanceof Section) && !(next instanceof Section)) ||
      (prev instanceof Section && next instanceof Section)
  );

  const uiTypeSetByUser = useStoreState((state) =>
    parameterStateDetailsGetter(
      state.uiTypes.uiTypes,
      sectionId,
      moduleName,
      objName,
      paramName
    )
  );

  const availableModules = useStoreState(
    (state) => state.master.availableModules
  );

  const setSectionParamType = useStoreActions(
    (actions) => actions.master.setSectionParamType
  );

  const setSectionModuleInfos = useStoreActions(
    (actions) => actions.master.setSectionModuleInfos
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

  const nestedSectionId = useStoreState((state) =>
    parameterStateDetailsGetter(
      state.nestedSectionIds.nestedSectionIds,
      sectionId,
      moduleName,
      objName,
      paramName
    )
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

  const maybeDeleteSection = () => {
    if (nestedSectionId) {
      permanentlyDeleteSection({
        sectionId: nestedSectionId,
        parentId: sectionId,
      });
    }
    wrapperSetNestedSectionId(null);
  };

  const uiType = uiTypeSetByUser ? uiTypeSetByUser : inputUiType;
  
  useEffect(() => {
    maybeDeleteSection();
  }, [uiType]);

  useEffect(() => {
    if (requiresNestedSection(uiType)) {
      const newSectionInfo = new Section(
        paramName,
        combineModules(
          availableModules,
          uiTypeConfig ? uiTypeConfig.modules : []
        )
      );
      wrapperSetSectionParamType(newSectionInfo);
      if (nestedSectionId) {
        setSectionModuleInfos({
          sectionId: nestedSectionId,
          newModuleInfos: newSectionInfo.moduleInfos,
        });
      }
    }
  }, [uiTypeConfig]);

  useEffect(() => {
    if (requiresNestedSection(uiType) && nestedSectionInfo instanceof Section) {
      const newNestedSectionId = addToVisibleSectionIdsThunk({
        name: paramName,
        parentId: sectionId,
        moduleName,
        objName,
        isList: uiType === "LIST_NESTED_OBJECT",
        siblingId: null,
      });
      wrapperSetNestedSectionId(newNestedSectionId);
    } else {
      maybeDeleteSection();
    }
  }, [nestedSectionInfo]);

  return null;
}
