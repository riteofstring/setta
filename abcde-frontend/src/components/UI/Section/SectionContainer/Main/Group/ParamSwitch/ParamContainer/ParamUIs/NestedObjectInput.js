import { Button } from "@chakra-ui/react";
import SectionConfigComp from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/SectionConfig/SectionConfigComp";
import { useStoreActions } from "easy-peasy";
import { useAddChild } from "hooks/useAddDeleteChild";
import { useReinitSectionType } from "hooks/useSectionType";
import React, { useEffect } from "react";
import { SET_FROM_SIDEPANE } from "utils/constants";

export function NestedObjectInputConfig({ origin, ...props }) {
  return origin === SET_FROM_SIDEPANE ? (
    <ButtonGoToSectionConfig {...props} />
  ) : (
    <SectionConfigComp {...props} />
  );
}

export function ButtonGoToSectionConfig({ childIdFn, paramInfoId }) {
  const existingChildId = childIdFn(paramInfoId)[0];
  const setTabIndex = useStoreActions((x) => x.uiEditor.setTabIndex);
  const setActiveSection = useStoreActions((x) => x.master.setActiveSection);
  const setCameFromUIConfig = useStoreActions(
    (x) => x.uiEditor.setCameFromUIConfig
  );

  const onClick = () => {
    if (existingChildId) {
      setActiveSection(existingChildId);
      setCameFromUIConfig(true);
      setTabIndex(0);
    }
  };
  return <Button onClick={onClick}>Configure section</Button>;
}

export default function NestedObjectInput({
  sectionId,
  paramName,
  uiTypeId,
  parentParamInfoId,
  childIdFn,
}) {
  const existingChildId = childIdFn(parentParamInfoId)[0];
  const addChild = useAddChild(sectionId);
  const reinitSectionType = useReinitSectionType(existingChildId);

  useEffect(() => {
    if (!existingChildId) {
      addChild({
        name: paramName,
        uiTypeId,
        parentParamInfoId,
      });
    } else {
      reinitSectionType({ name: sectionTypeName, sectionSpecs });
    }
  }, [uiTypeId]);

  return null;
}
