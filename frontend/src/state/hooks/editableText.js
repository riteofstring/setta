import C from "constants/constants.json";
import { useEffect, useState } from "react";
import { requiresKeyInput } from "utils/sectionTypeHelpers";
import { useGetSectionTypeConfig, useIsOneOfType } from "./uiTypes";

export function useEditableOnSubmit(initialValue, onSetTitle, condition) {
  const [inputValue, setInputValue] = useState(initialValue);

  async function onBlur(v) {
    if (v != "" && v != initialValue && (await condition(v))) {
      onSetTitle(v);
    } else {
      setInputValue(initialValue);
    }
  }

  function onCancel() {
    setInputValue(initialValue);
  }

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  return [inputValue, setInputValue, onBlur, onCancel];
}

export function useTitleIsEditable(sectionId) {
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isUneditableType = useIsOneOfType(sectionId, [
    C.OUTPUT,
    C.GLOBAL_VARIABLES,
    C.PARAM_SWEEP,
    C.GLOBAL_PARAM_SWEEP,
    C.VAR_CONTROL,
  ]);

  return requiresKeyInput(sectionSubType) && !isUneditableType;
}
