import { CUIAutoComplete } from "chakra-ui-autocomplete";
import { SectionInfo } from "../../../../../../../../../classes/jsonParser";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useEffect, useState } from "react";
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
    console.log("selectedItems", selectedItems)
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
      setUIType({ sectionId: nestedSectionId, uiType });
    }
  }, [uiType]);

  useEffect(() => {
    if (nestedSectionId) {
      setSectionModules({
        sectionId: nestedSectionId,
        specs: paramUITypeConfig["modules"],
      });
    }
  }, [paramUITypeConfig]);

  // const nestedSectionInfo = useStoreState(
  //   (state) =>
  //     sectionParameterGetter(
  //       state.master.sections,
  //       sectionId,
  //       moduleName,
  //       objName,
  //       paramName
  //     ).type,
  //   //only care about x -> Section or Section -> x
  //   (prev, next) =>
  //     (!(prev instanceof SectionInfo) && !(next instanceof SectionInfo)) ||
  //     (prev instanceof SectionInfo && next instanceof SectionInfo)
  // );

  // const uiTypeSetByUser = useStoreState((state) =>
  //   parameterStateDetailsGetter(
  //     state.uiTypes.uiTypes,
  //     sectionId,
  //     moduleName,
  //     objName,
  //     paramName
  //   )
  // );

  // const availableModules = useStoreState(
  //   (state) => state.master.availableModules
  // );

  // const setSectionParamType = useStoreActions(
  //   (actions) => actions.master.setSectionParamType
  // );

  // const setSectionModuleInfos = useStoreActions(
  //   (actions) => actions.master.setSectionModuleInfos
  // );

  // const setNestedSectionIds = useStoreActions(
  //   (actions) => actions.nestedSectionIds.setNestedSectionIds
  // );

  // const permanentlyDeleteSection = useStoreActions(
  //   (actions) => actions.master.permanentlyDeleteSection
  // );

  // const addToVisibleSectionIdsThunk = useStoreActions(
  //   (actions) => actions.master.addToVisibleSectionIdsThunk
  // );

  // const nestedSectionId = useStoreState((state) =>
  //   parameterStateDetailsGetter(
  //     state.nestedSectionIds.nestedSectionIds,
  //     sectionId,
  //     moduleName,
  //     objName,
  //     paramName
  //   )
  // );

  // const wrapperSetNestedSectionId = (newNestedSectionId) => {
  //   setNestedSectionIds({
  //     sectionId,
  //     moduleName,
  //     objName,
  //     paramName,
  //     nestedSectionId: newNestedSectionId,
  //   });
  // };

  // const wrapperSetSectionParamType = (newType) => {
  //   setSectionParamType({
  //     sectionId,
  //     moduleName,
  //     objName,
  //     paramName,
  //     newType,
  //   });
  // };

  // const maybeDeleteSection = () => {
  //   if (nestedSectionId) {
  //     permanentlyDeleteSection({
  //       sectionId: nestedSectionId,
  //       parentId: sectionId,
  //     });
  //   }
  //   wrapperSetNestedSectionId(null);
  // };

  // const uiType = uiTypeSetByUser ? uiTypeSetByUser : inputUiType;

  // useEffect(() => {
  //   maybeDeleteSection();
  // }, [uiType]);

  // useEffect(() => {
  //   if (requiresNestedSection(uiType)) {
  //     const newSectionInfo = new SectionInfo(
  //       paramName,
  //       combineModules(
  //         availableModules,
  //         uiTypeConfig ? uiTypeConfig.modules : []
  //       )
  //     );
  //     wrapperSetSectionParamType(newSectionInfo);
  //     if (nestedSectionId) {
  //       setSectionModuleInfos({
  //         sectionId: nestedSectionId,
  //         newModuleInfos: newSectionInfo.moduleInfos,
  //       });
  //     }
  //   }
  // }, [uiTypeConfig]);

  // useEffect(() => {
  //   if (requiresNestedSection(uiType) && nestedSectionInfo instanceof SectionInfo) {
  //     const newNestedSectionId = addToVisibleSectionIdsThunk({
  //       name: paramName,
  //       parentId: sectionId,
  //       moduleName,
  //       objName,
  //       isList: uiType === "LIST_NESTED_OBJECT",
  //       siblingId: null,
  //     });
  //     wrapperSetNestedSectionId(newNestedSectionId);
  //   } else {
  //     maybeDeleteSection();
  //   }
  // }, [nestedSectionInfo]);

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

  useEffect(() => {
    if (nestedSectionId) {
      console.log("deleting section", sectionId);
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
