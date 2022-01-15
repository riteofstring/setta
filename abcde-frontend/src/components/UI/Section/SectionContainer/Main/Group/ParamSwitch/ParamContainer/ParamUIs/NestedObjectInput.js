import { Button } from "@chakra-ui/react";
import { useReinitSectionType, useAddChild } from "hooks/useCreateInfo";
import React, { useEffect } from "react";

export function NestedObjectInputConfig() {
  return <Button>Configure section</Button>;
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
  const reinitSectionType = useReinitSectionType(existingChildId);

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
        uiType,
        uiTypeConfig,
      });
    }
  }, [uiType, uiTypeConfig]);

  return null;
}
