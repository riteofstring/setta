import { Button } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useReinitSectionType, useAddChild } from "hooks/useCreateInfo";
import React, { useEffect } from "react";

export function NestedObjectInputConfig({ childIdFn, paramInfoId }) {
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
  uiType,
  parentParamInfoId,
  childIdFn,
}) {
  const existingChildId = childIdFn(parentParamInfoId)[0];
  const addChild = useAddChild(sectionId);
  const reinitSectionType = useReinitSectionType(existingChildId);
  const sectionTypeName = uiType.name;
  const sectionSpecs = uiType.config;

  console.log("NestedObjectInput", uiType);

  useEffect(() => {
    if (!existingChildId) {
      addChild({
        name: paramName,
        sectionTypeName,
        sectionSpecs,
        parentParamInfoId,
      });
    } else {
      reinitSectionType({ name: sectionTypeName, sectionSpecs });
    }
  }, [uiType]);

  return null;
}
